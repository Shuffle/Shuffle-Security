import { docSlug, fetchDocMarkdown, resolveDocName } from './remoteDocs';

export type DocGroupId = 'usability' | 'automation' | 'security' | 'infrastructure' | 'other';

export interface DocGroupDefinition {
  id: DocGroupId;
  label: string;
  description: string;
  /** Slugs belonging to this group in display order */
  slugs: string[];
}

export const DOC_GROUPS: DocGroupDefinition[] = [
  {
    id: 'usability',
    label: 'Usability',
    description: 'Platform overview, getting started, tenants, features, and API reference.',
    slugs: ['getting_started', 'getting-started', 'about', 'tenants', 'features', 'api'],
  },
  {
    id: 'automation',
    label: 'Automation',
    description: 'Workflows, apps, AI agents, and playbook automations.',
    slugs: ['workflows', 'apps', 'ai'],
  },
  {
    id: 'security',
    label: 'Security',
    description: 'Incident triage, vulnerability management, host posture, and response.',
    slugs: ['incidents', 'vulnerabilities', 'monitors', 'host-monitors', 'detection', 'sigma'],
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    description: 'Architecture, configuration, extensions, and troubleshooting.',
    slugs: ['architecture', 'configuration', 'extensions', 'troubleshooting'],
  },
];

/** Human-readable display titles for navigation items */
export const DOC_LABEL_OVERRIDES: Record<string, string> = {
  ai: 'Agents & AI',
  api: 'API Reference',
  getting_started: 'Getting Started',
  incidents: 'Incidents & Cases',
  vulnerabilities: 'Vulnerabilities',
  monitors: 'Host Monitors',
  'host-monitors': 'Host Monitors',
  about: 'About Shuffle',
  tenants: 'Tenants & Multi-Tenancy',
  features: 'Features Overview',
  workflows: 'Workflows',
  apps: 'Apps & Integrations',
  extensions: 'Extensions',
  architecture: 'Architecture',
  configuration: 'Configuration',
  troubleshooting: 'Troubleshooting',
};

/** Get the group definition that contains a specific doc slug. Defaults to "Usability" for unclassified docs or index. */
export const getDocGroup = (slug: string): DocGroupDefinition => {
  const usabilityGroup = DOC_GROUPS.find((g) => g.id === 'usability') || DOC_GROUPS[0];
  if (!slug || slug === 'index') return usabilityGroup;
  const clean = slug.toLowerCase().replace(/_+/g, '-');
  for (const group of DOC_GROUPS) {
    if (group.slugs.includes(clean)) {
      return group;
    }
  }
  return usabilityGroup;
};

/** Get custom human-readable label or fallback to formatted string */
export const getDocDisplayLabel = (slug: string, fallbackName?: string): string => {
  const clean = (slug || '').toLowerCase().replace(/_+/g, '-');
  if (DOC_LABEL_OVERRIDES[clean]) {
    return DOC_LABEL_OVERRIDES[clean];
  }
  const raw = fallbackName || slug || '';
  return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

export interface GroupedDocsCategory {
  id: string;
  label: string;
  description?: string;
  docs: Array<{
    name: string;
    slug: string;
    label: string;
    read_time?: number;
  }>;
}

/**
 * Groups an array of RemoteDocs into structured categories.
 * For standard docs, groups into Usability, Automation, Security, Infrastructure.
 * Uncategorized items or custom folders (e.g. Legal) are grouped cleanly.
 */
export const groupRemoteDocs = (
  docs: Array<{ name: string; slug: string; label: string; read_time?: number }>,
  folder?: string,
): GroupedDocsCategory[] => {
  if (!docs || docs.length === 0) return [];

  // For custom folders like "legal", keep single category
  if (folder && folder !== 'docs') {
    const folderLabel = folder.charAt(0).toUpperCase() + folder.slice(1);
    return [
      {
        id: folder,
        label: folderLabel,
        description: `${folderLabel} documentation and resources.`,
        docs,
      },
    ];
  }

  const docMap = new Map<string, (typeof docs)[0]>();
  for (const doc of docs) {
    docMap.set(doc.slug.toLowerCase(), doc);
  }

  const result: GroupedDocsCategory[] = [];
  const handledSlugs = new Set<string>();

  for (const groupDef of DOC_GROUPS) {
    const groupDocs: (typeof docs)[0][] = [];
    for (const slug of groupDef.slugs) {
      const clean = slug.toLowerCase().replace(/_+/g, '-');
      const match = docMap.get(slug.toLowerCase()) || docMap.get(clean);
      if (match && !handledSlugs.has(match.slug.toLowerCase())) {
        groupDocs.push({
          ...match,
          label: getDocDisplayLabel(match.slug, match.label),
        });
        handledSlugs.add(match.slug.toLowerCase());
        handledSlugs.add(slug.toLowerCase());
        handledSlugs.add(clean);
      }
    }

    if (groupDocs.length > 0) {
      result.push({
        id: groupDef.id,
        label: groupDef.label,
        description: groupDef.description,
        docs: groupDocs,
      });
    }
  }

  // Handle any unclassified docs: put them into "Usability"
  const remaining = docs.filter((d) => !handledSlugs.has(d.slug.toLowerCase()));
  if (remaining.length > 0) {
    const formattedRemaining = remaining.map((d) => ({
      ...d,
      label: getDocDisplayLabel(d.slug, d.label),
    }));

    const usabilityCategory = result.find((r) => r.id === 'usability');
    if (usabilityCategory) {
      usabilityCategory.docs.push(...formattedRemaining);
    } else {
      const usabilityDef = DOC_GROUPS.find((g) => g.id === 'usability') || DOC_GROUPS[0];
      result.unshift({
        id: usabilityDef.id,
        label: usabilityDef.label,
        description: usabilityDef.description,
        docs: formattedRemaining,
      });
    }
  }

  return result;
};

// In-memory cache for group docs content
const groupDocsCache = new Map<string, Record<string, string>>();
const groupDocsInflight = new Map<string, Promise<Record<string, string>>>();

/**
 * Loads markdown content for all documents belonging to a group.
 * Results are cached in-memory for instant injection into AI prompts.
 */
export const loadGroupDocsContent = async (
  groupId: string,
  folder?: string,
  signal?: AbortSignal,
): Promise<Record<string, string>> => {
  const cacheKey = `${folder || 'docs'}:${groupId}`;
  if (groupDocsCache.has(cacheKey)) {
    return groupDocsCache.get(cacheKey)!;
  }
  if (groupDocsInflight.has(cacheKey)) {
    return groupDocsInflight.get(cacheKey)!;
  }

  const groupDef = DOC_GROUPS.find((g) => g.id === groupId);
  if (!groupDef) return {};

  const promise = (async () => {
    const results: Record<string, string> = {};
    const fetchPromises = groupDef.slugs.map(async (slug) => {
      try {
        const resolvedName = (await resolveDocName(slug, false, folder, signal)) || slug;
        if (signal?.aborted) return;
        const markdown = await fetchDocMarkdown(resolvedName, false, folder, signal);
        if (markdown && typeof markdown === 'string') {
          results[slug] = markdown;
        }
      } catch {
        // Continue if single file fails
      }
    });

    await Promise.all(fetchPromises);
    groupDocsCache.set(cacheKey, results);
    groupDocsInflight.delete(cacheKey);
    return results;
  })();

  groupDocsInflight.set(cacheKey, promise);
  return promise;
};

/**
 * Returns synchronously any cached markdown documents for a group,
 * converted to GroupDocSnippet items.
 */
export const getCachedGroupDocs = (
  groupId: string,
  folder?: string,
): Array<{ slug: string; title: string; content: string }> => {
  const cacheKey = `${folder || 'docs'}:${groupId}`;
  const cached = groupDocsCache.get(cacheKey);
  if (!cached) return [];
  return Object.entries(cached).map(([slug, content]) => ({
    slug,
    title: getDocDisplayLabel(slug),
    content,
  }));
};
