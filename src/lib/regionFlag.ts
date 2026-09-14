// Single source of truth for resolving which Shuffle region a tenant lives in.
//
// Every surface that shows or uses a tenant region MUST go through this — the
// sidebar tenant switcher, the tenant tables under /admin, and the cross-region
// datastore writes in the incident move dialog. Keeping separate copies of this
// mapping is what let the sidebar claim every tenant was UK while the tenant
// table correctly reported Canada and Germany for the same tenants.
//
// Accepts a raw region URL in any of the shapes the API returns:
//   ca.shuffler.io | https://ca.shuffler.io | https://ca.shuffle.security
//   legacy location names (california, frankfurt, london, canada, australia)

export interface ResolvedRegion {
  flag: string;
  /** Short region code, e.g. UK, US, EU, EU-2, DE, CA, AUS. */
  code: string;
  /** False when the region could not be identified from the URL. */
  known: boolean;
}

const UK: ResolvedRegion = { flag: '🇬🇧', code: 'UK', known: true };

// Region subdomains, plus the legacy location names the backend used before
// regions were subdomains.
const REGIONS: { match: string[]; region: ResolvedRegion }[] = [
  { match: ['us', 'california'], region: { flag: '🇺🇸', code: 'US', known: true } },
  { match: ['eu2', 'eu-2'], region: { flag: '🇪🇺', code: 'EU-2', known: true } },
  { match: ['de', 'frankfurt'], region: { flag: '🇩🇪', code: 'DE', known: true } },
  { match: ['eu'], region: { flag: '🇪🇺', code: 'EU', known: true } },
  { match: ['ca', 'canada'], region: { flag: '🇨🇦', code: 'CA', known: true } },
  { match: ['au', 'aus', 'australia'], region: { flag: '🇦🇺', code: 'AUS', known: true } },
  { match: ['uk', 'london'], region: UK },
];

/** Hosts that ARE the base (no region subdomain) — these are the UK region. */
const BASE_HOSTS = new Set([
  'shuffler.io',
  'www.shuffler.io',
  'shuffle.security',
  'www.shuffle.security',
]);

const hostnameOf = (regionUrl: string): string => {
  const trimmed = regionUrl.trim();
  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return trimmed.toLowerCase().replace(/^.*:\/\//, '').split('/')[0] || '';
  }
};

/**
 * Resolve the region a tenant lives in from its `region_url`.
 * No region URL at all means the tenant lives in the default (UK) region.
 */
export const getRegionFlag = (regionUrl?: string | null): ResolvedRegion => {
  if (!regionUrl || typeof regionUrl !== 'string' || !regionUrl.trim()) return UK;

  const hostname = hostnameOf(regionUrl);
  if (!hostname) return UK;
  if (BASE_HOSTS.has(hostname)) return UK;

  const labels = hostname.split('.');
  const subdomain = labels.length > 2 ? labels[0] : '';

  // Prefer an exact subdomain match — substring matching on a whole URL is how
  // "shuffle.security" style hosts got mistaken for other regions.
  if (subdomain) {
    for (const entry of REGIONS) {
      if (entry.match.includes(subdomain)) return entry.region;
    }
  }

  // Fall back to legacy location names anywhere in the URL.
  const lower = regionUrl.toLowerCase();
  for (const entry of REGIONS) {
    if (entry.match.some((m) => m.length > 2 && lower.includes(m))) return entry.region;
  }

  // Unknown region: surface the raw subdomain rather than silently claiming UK.
  if (subdomain) return { flag: '🏳️', code: subdomain.toUpperCase(), known: false };
  return UK;
};

export default getRegionFlag;
