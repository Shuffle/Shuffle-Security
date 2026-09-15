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
