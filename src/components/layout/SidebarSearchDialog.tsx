/**
 * SidebarSearchDialog — Ctrl+K powered search popup for the sidebar.
 * Searches apps and documentation via Algolia + correlations via /api/v2/correlations + workflows via /api/v1/workflows + local nav items.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from '@/lib/router-compat';
import { algoliasearch } from 'algoliasearch';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Box, Typography, InputBase, CircularProgress } from '@mui/material';
import { Network, Braces, Waypoints, Link2, Workflow, Activity, BookOpen, LayoutDashboard, Shield, HardDrive, Radar, Users, Bug, MonitorCheck, Search as SearchIcon, AlertTriangle as WarningAmberIcon, Radar as RadarIcon, FileText as DescriptionIcon, SlidersHorizontal as TuneIcon, Fingerprint as FingerprintIcon, Rss as RssFeedIcon, Settings as SettingsIcon, Target } from 'lucide-react';
import AgentIcon from '@/Shuffle-MCPs/components/AgentIcon';
import { getApiUrl, getAuthHeader, getShuffleCoreUrl, getShuffleCoreWorkflowUrl } from '@/Shuffle-MCPs/api';
import { navigateToShuffleCore, isShuffleCoreUrl } from '@/lib/authHandoff';
import { useWorkflows } from '@/hooks/useWorkflows';
import type { AlgoliaSearchApp } from '@/Shuffle-MCPs/shuffle-mcp.helpers';

const ALGOLIA_APP_ID = 'JNSS5CFDZZ';
const ALGOLIA_API_KEY = '33e4e3564f4f060e96e0531957bed552';

const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_API_KEY);

interface NavResult {
  type: 'nav';
  label: string;
  path: string;
  icon: React.ReactNode;
  indent?: boolean;
  group?: string;
  external?: boolean;
  hiddenUnlessSearched?: boolean;
}

interface AppResult {
  type: 'app';
  app: AlgoliaSearchApp;
}

interface CorrelationItem {
  key: string;
  amount: number;
  ref: string[];
}

interface CorrelationResult {
  type: 'correlation';
  correlation: CorrelationItem;
}

interface WorkflowItem {
  id: string;
  name: string;
  description?: string;
}

interface WorkflowResult {
  type: 'workflow';
  workflow: WorkflowItem;
}

interface IncidentItem {
  id: string;
  title: string;
}

interface IncidentResult {
  type: 'incident';
  incident: IncidentItem;
}

interface DocItem {
  name: string;
  slug: string;
  label: string;
  path?: string;
  snippet?: string;
}

interface DocResult {
  type: 'doc';
  doc: DocItem;
}

type SearchResult = NavResult | AppResult | CorrelationResult | WorkflowResult | IncidentResult | DocResult;

const docLabel = (name: string) =>
  name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

interface AlgoliaDocHit {
  objectID: string;
  title?: string;
  filename?: string;
  data?: string;
  urlpath?: string;
  _highlightResult?: {
    data?: { value?: string };
  };
}

const algoliaDocToItem = (hit: AlgoliaDocHit): DocItem | null => {
  const rawPath = typeof hit.urlpath === 'string' ? hit.urlpath.trim() : '';
  const pathWithoutHash = rawPath.split('#')[0];
  const filename = typeof hit.filename === 'string' ? hit.filename.trim() : '';
  const fallbackName = filename.replace(/\.md$/i, '');
  const slug = pathWithoutHash.startsWith('/docs/')
    ? pathWithoutHash.slice('/docs/'.length).replace(/^\/+|\/+$/g, '')
    : pathWithoutHash.startsWith('/articles/')
    ? pathWithoutHash.slice('/articles/'.length).replace(/^\/+|\/+$/g, '')
    : pathWithoutHash.startsWith('/legal/')
    ? pathWithoutHash.slice('/legal/'.length).replace(/^\/+|\/+$/g, '')
    : fallbackName.replace(/[_\s]+/g, '-').toLowerCase();
  if (!slug) return null;

  const highlighted = hit._highlightResult?.data?.value;
  const rawSnippet = typeof highlighted === 'string' && highlighted.trim()
    ? highlighted.replace(/<[^>]+>/g, '')
    : typeof hit.data === 'string' ? hit.data : '';

  const isKnownDocRoute = rawPath.startsWith('/docs/') || rawPath.startsWith('/articles/') || rawPath.startsWith('/legal/');

  return {
    name: filename || slug,
    slug,
    label: hit.title?.trim() || docLabel(fallbackName || slug),
    path: isKnownDocRoute ? rawPath : rawPath.startsWith('/') ? rawPath : `/docs/${slug}`,
    snippet: rawSnippet.replace(/\s+/g, ' ').trim().slice(0, 150),
  };
};

const NAV_GROUP_ORDER = ['Pages', 'Security', 'Automation'] as const;

const navItems: NavResult[] = [
  { type: 'nav', label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={16} />, group: 'Pages' },
  { type: 'nav', label: 'Agents', path: '/agents', icon: <AgentIcon size={16} />, group: 'Pages' },
  { type: 'nav', label: 'Usecases', path: '/usecases', icon: <Activity size={16} />, group: 'Pages' },
  { type: 'nav', label: 'Documentation', path: '/docs', icon: <BookOpen size={16} />, group: 'Pages' },
  { type: 'nav', label: 'UI Preferences', path: '/admin/preferences', icon: <TuneIcon size={16} />, group: 'Pages', hiddenUnlessSearched: true },
  { type: 'nav', label: 'Settings', path: '/settings', icon: <SettingsIcon size={16} />, group: 'Pages', hiddenUnlessSearched: true },

  { type: 'nav', label: 'Incidents', path: '/incidents', icon: <WarningAmberIcon size={18} />, group: 'Security' },
  { type: 'nav', label: 'Vulnerabilities', path: '/vulnerabilities', icon: <Bug size={16} />, group: 'Security' },
  { type: 'nav', label: 'Host Monitors', path: '/monitors', icon: <MonitorCheck size={16} />, group: 'Security' },


  { type: 'nav', label: 'Workflows', path: getShuffleCoreWorkflowUrl(), icon: <Workflow size={16} />, group: 'Automation', external: true },
  { type: 'nav', label: 'Apps', path: '/apps', icon: <Braces size={16} />, group: 'Automation' },
  { type: 'nav', label: 'Storage', path: getShuffleCoreUrl('/admin?tab=datastore'), icon: <HardDrive size={16} />, group: 'Automation', external: true },
  { type: 'nav', label: 'Files', path: getShuffleCoreUrl('/admin?tab=files'), icon: <DescriptionIcon size={16} />, group: 'Automation', external: true },
];


const NOISE_KEYS = new Set([
  'new', 'in_progress', 'resolved', 'escalated', 'closed', 'open', 'pending',
  'critical', 'high', 'medium', 'low', 'informational', 'info', 'warning', 'error',
  'unknown', 'none', 'null', 'undefined', 'true', 'false',
]);

interface SidebarSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SidebarSearchDialog = ({ open, onOpenChange }: SidebarSearchDialogProps) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const { data: allWorkflows = [] } = useWorkflows();
  const [appResults, setAppResults] = useState<AlgoliaSearchApp[]>([]);
  const [correlationResults, setCorrelationResults] = useState<CorrelationItem[]>([]);
  const [workflowResults, setWorkflowResults] = useState<WorkflowItem[]>([]);
  const [incidentResults, setIncidentResults] = useState<IncidentItem[]>([]);
  const [docResults, setDocResults] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [correlationsLoading, setCorrelationsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const appDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const corrDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter workflows locally by query
  useEffect(() => {
    if (!query.trim()) {
      // Never set a fresh [] when we are already empty — `allWorkflows` is a
      // new array reference on every render, so an unconditional setState here
      // re-triggers this effect forever ("Maximum update depth exceeded").
      setWorkflowResults((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const q = query.toLowerCase();
    const filtered = allWorkflows.filter(
      (w) => w.name?.toLowerCase().includes(q) || w.description?.toLowerCase().includes(q)
    ).slice(0, 6);
    setWorkflowResults((prev) => {
      if (prev.length === filtered.length && prev.every((p, i) => p === filtered[i])) return prev;
      return filtered;
    });
  }, [query, allWorkflows]);

  // Filter nav items by query, keeping them ordered by group
  const matchedNav: NavResult[] = query.trim()
    ? navItems.filter((n) => n.label.toLowerCase().includes(query.toLowerCase()))
    : navItems.filter((n) => !n.hiddenUnlessSearched);
  const filteredNav: NavResult[] = NAV_GROUP_ORDER.flatMap((group) =>
    matchedNav.filter((n) => (n.group || 'Pages') === group),
  );


  // Split correlations into "direct matches" (key equals or starts-with query)
  // and everything else. Direct matches are typically a thread_id or an
  // incident id that the analyst pasted in — surface them above the noisier
  // observable-value correlations.
  const qLower = query.trim().toLowerCase();
  const directMatchCorrelations = qLower
    ? correlationResults.filter((c) => c.key.toLowerCase() === qLower)
    : [];
  const otherCorrelations = correlationResults.filter(
    (c) => !directMatchCorrelations.includes(c),
  );

  // Combined results: nav → workflows → incidents → direct-match correlations
  // → other correlations → apps.
  const results: SearchResult[] = [
    ...filteredNav,
    ...docResults.map((d) => ({ type: 'doc' as const, doc: d })),
    ...workflowResults.map((w) => ({ type: 'workflow' as const, workflow: w })),
    ...incidentResults.map((i) => ({ type: 'incident' as const, incident: i })),
    ...directMatchCorrelations.map((c) => ({ type: 'correlation' as const, correlation: c })),
    ...otherCorrelations.map((c) => ({ type: 'correlation' as const, correlation: c })),
    ...appResults.map((app) => ({ type: 'app' as const, app })),
  ];

  // Search both public Algolia indexes. Documentation results are full-text
  // matches from the `documentation` index rather than title-only filtering.
  const searchAlgolia = useCallback(async (q: string) => {
    if (!q.trim()) {
      setAppResults([]);
      setDocResults([]);
      return;
    }
    setLoading(true);
    try {
      const [appsResponse, docsResponse] = await Promise.all([
        client.searchSingleIndex({
          indexName: 'appsearch',
          searchParams: { query: q, hitsPerPage: 8 },
        }),
        client.searchSingleIndex({
          indexName: 'documentation',
          searchParams: {
            query: q,
            hitsPerPage: 12,
            attributesToRetrieve: ['title', 'filename', 'data', 'urlpath'],
            attributesToHighlight: ['data'],
            highlightPreTag: '',
            highlightPostTag: '',
          },
        }),
      ]);
      setAppResults(appsResponse.hits as AlgoliaSearchApp[]);

      const seenDocs = new Set<string>();
      const docs = (docsResponse.hits as unknown as AlgoliaDocHit[])
        .map(algoliaDocToItem)
        .filter((doc): doc is DocItem => {
          if (!doc) return false;
          const key = doc.name.toLowerCase();
          if (seenDocs.has(key)) return false;
          seenDocs.add(key);
          return true;
        })
        .slice(0, 6);
      setDocResults(docs);
    } catch {
      setAppResults([]);
      setDocResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Search correlations
  const searchCorrelations = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) {
      setCorrelationResults([]);
      return;
    }
    setCorrelationsLoading(true);
    try {
      const response = await fetch(getApiUrl('/api/v2/correlations'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          type: 'datastore',
          key: q.trim(),
          category: 'shuffle-security_incidents',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const rawCorrelationData = Array.isArray(data) ? data : (data.correlations || data.data || []);
        const correlationData = Array.isArray(rawCorrelationData) ? rawCorrelationData : [];
        const filtered = correlationData.filter((candidate: unknown): candidate is CorrelationItem => {
          if (!candidate || typeof candidate !== 'object') return false;
          const correlation = candidate as Partial<CorrelationItem>;
          if (typeof correlation.key !== 'string' || !correlation.key.trim()) return false;
          if (!Array.isArray(correlation.ref) || correlation.ref.length === 0) return false;
          return correlation.ref.some((ref) => typeof ref === 'string' && ref.includes('shuffle-security_incidents'))
            && !NOISE_KEYS.has(correlation.key.toLowerCase());
        });
        setCorrelationResults(filtered.slice(0, 8));
      } else {
        setCorrelationResults([]);
      }
    } catch {
      setCorrelationResults([]);
    } finally {
      setCorrelationsLoading(false);
    }
  }, []);

  // Debounced fan-out: Algolia (apps + documentation) and correlations.
  useEffect(() => {
    if (appDebounceRef.current) clearTimeout(appDebounceRef.current);
    if (corrDebounceRef.current) clearTimeout(corrDebounceRef.current);

    if (!query.trim()) {
      setAppResults([]);
      setDocResults([]);
      setCorrelationResults([]);
      setLoading(false);
      setCorrelationsLoading(false);
      return;
    }

    appDebounceRef.current = setTimeout(() => searchAlgolia(query), 200);
    corrDebounceRef.current = setTimeout(() => searchCorrelations(query), 350);

    return () => {
      if (appDebounceRef.current) clearTimeout(appDebounceRef.current);
      if (corrDebounceRef.current) clearTimeout(corrDebounceRef.current);
    };
  }, [query, searchAlgolia, searchCorrelations]);

  // Incident lookups are covered by the correlations endpoint, which already
  // tells us whether an incident exists. No per-keystroke datastore reads.



  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setAppResults([]);
      setDocResults([]);
      setCorrelationResults([]);
      setWorkflowResults([]);
      setIncidentResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = (result: SearchResult) => {
    if (result.type === 'nav') {
      if (result.external) {
        if (isShuffleCoreUrl(result.path)) {
          navigateToShuffleCore(result.path, { newTab: true });
        } else {
          window.open(result.path, '_blank');
        }
      } else {
        navigate(result.path);
      }

    } else if (result.type === 'app') {
      navigate(`/apps?app=${result.app.name}`);
    } else if (result.type === 'workflow') {
      // Open workflow in Shuffle Core
      navigateToShuffleCore(getShuffleCoreWorkflowUrl(result.workflow.id), { newTab: true });
    } else if (result.type === 'doc') {
      navigate(result.doc.path || `/docs/${result.doc.slug}`);
    } else if (result.type === 'incident') {
      navigate(`/incidents/${encodeURIComponent(result.incident.id)}`);
    } else if (result.type === 'correlation') {
      const incidentRef = result.correlation.ref?.find((r) => r.includes('shuffle-security_incidents'));
      if (incidentRef) {
        // Ref format: "shuffle-security_incidents|<key>" — extract key after the pipe
        const key = incidentRef.includes('|') 
          ? incidentRef.split('|').pop() 
          : incidentRef.split('/').pop();
        if (key) {
          navigate(`/incidents/${key}`);
        }
      }
    }
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  };

  const isAnyLoading = loading || correlationsLoading;

  // Compute global indices for each section
  const docsStartIdx = filteredNav.length;
  const workflowStartIdx = docsStartIdx + docResults.length;
  const incidentStartIdx = workflowStartIdx + workflowResults.length;
  const directMatchStartIdx = incidentStartIdx + incidentResults.length;
  const correlationStartIdx = directMatchStartIdx + directMatchCorrelations.length;
  const appStartIdx = correlationStartIdx + otherCorrelations.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        className="p-0 gap-0 overflow-hidden border-0"
        
        style={{
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 12,
          width: 520,
          minWidth: 520,
          maxWidth: 520,
          minHeight: 400,
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1501,
        }}
      >
        {/* Search input */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2.5,
            py: 1.5,
            borderBottom: '1px solid hsl(var(--border))',
          }}
        >
          <SearchIcon size={20} style={{ color: 'hsl(var(--muted-foreground))' }} />
          <InputBase
            inputRef={inputRef}
            placeholder="Search pages, docs, workflows, apps, correlations..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            fullWidth
            sx={{
              color: 'hsl(var(--foreground))',
              fontSize: '0.9rem',
              '& input::placeholder': { color: 'hsl(var(--muted-foreground))', opacity: 1 },
            }}
          />
          {isAnyLoading && <CircularProgress size={16} sx={{ color: 'hsl(var(--primary))' }} />}
          <Typography
            sx={{
              fontSize: '0.7rem',
              color: 'hsl(var(--muted-foreground))',
              fontFamily: 'monospace',
              border: '1px solid hsl(var(--border))',
              borderRadius: 0.5,
              px: 0.75,
              py: 0.25,
              flexShrink: 0,
            }}
          >
            ESC
          </Typography>
        </Box>

        {/* Results */}
        <Box sx={{ overflowY: 'auto', flex: 1 }}>
          {/* Nav sections, grouped */}
          {filteredNav.length > 0 && NAV_GROUP_ORDER.map((group) => {
            const items = filteredNav.filter((n) => (n.group || 'Pages') === group);
            if (items.length === 0) return null;
            return (
              <Box key={group} sx={{ px: 1.5, pt: 1.5, pb: 0.5 }}>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 1, px: 1, mb: 0.5 }}>
                  {group}
                </Typography>
                {items.map((item) => {
                  const globalIdx = filteredNav.indexOf(item);
                  return (
                    <Box
                      key={item.path}
                      onClick={() => handleSelect(item)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        px: 1.5,
                        pl: item.indent ? 3.5 : 1.5,
                        py: 1,
                        borderRadius: 1,
                        cursor: 'pointer',
                        backgroundColor: selectedIndex === globalIdx ? 'hsl(var(--muted))' : 'transparent',
                        '&:hover': { backgroundColor: 'hsl(var(--muted))', opacity: 0.9 },
                      }}
                    >
                      <Box sx={{ color: 'hsl(var(--muted-foreground))', display: 'flex' }}>{item.icon}</Box>
                      <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--foreground))' }}>{item.label}</Typography>
                    </Box>
                  );
                })}
              </Box>
            );
          })}


          {/* Documentation section */}
          {docResults.length > 0 && (
            <Box sx={{ px: 1.5, pt: 1.5, pb: 0.5 }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 1, px: 1, mb: 0.5 }}>
                Documentation
              </Typography>
              {docResults.map((doc, idx) => {
                const globalIdx = docsStartIdx + idx;
                return (
                  <Box
                    key={doc.slug}
                    onClick={() => handleSelect({ type: 'doc', doc })}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 1.5,
                      py: 1,
                      borderRadius: 1,
                      cursor: 'pointer',
                      backgroundColor: selectedIndex === globalIdx ? 'hsl(var(--muted))' : 'transparent',
                      '&:hover': { backgroundColor: 'hsl(var(--muted))', opacity: 0.9 },
                    }}
                  >
                    <Box sx={{ color: 'hsl(var(--muted-foreground))', display: 'flex' }}>
                      <BookOpen size={16} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.label}</Typography>
                      {doc.snippet && (
                        <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.snippet}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}

          {/* Workflows section */}
          {workflowResults.length > 0 && (
            <Box sx={{ px: 1.5, pt: 1.5, pb: 0.5 }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 1, px: 1, mb: 0.5 }}>
                Workflows
              </Typography>
              {workflowResults.map((wf, idx) => {
                const globalIdx = workflowStartIdx + idx;
                return (
                  <Box
                    key={wf.id}
                    onClick={() => handleSelect({ type: 'workflow', workflow: wf })}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 1.5,
                      py: 1,
                      borderRadius: 1,
                      cursor: 'pointer',
                      backgroundColor: selectedIndex === globalIdx ? 'hsl(var(--muted))' : 'transparent',
                      '&:hover': { backgroundColor: 'hsl(var(--muted))', opacity: 0.9 },
                    }}
                  >
                    <Box sx={{ color: 'hsl(var(--muted-foreground))', display: 'flex' }}>
                      <Workflow size={16} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {wf.name}
                      </Typography>
                      {wf.description && (
                        <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {wf.description}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}

          {/* Incidents section — direct id lookup */}
          {incidentResults.length > 0 && (
            <Box sx={{ px: 1.5, pt: 1.5, pb: 0.5 }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 1, px: 1, mb: 0.5 }}>
                Incidents
              </Typography>
              {incidentResults.map((inc, idx) => {
                const globalIdx = incidentStartIdx + idx;
                return (
                  <Box
                    key={inc.id}
                    onClick={() => handleSelect({ type: 'incident', incident: inc })}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 1.5,
                      py: 1,
                      borderRadius: 1,
                      cursor: 'pointer',
                      backgroundColor: selectedIndex === globalIdx ? 'hsl(var(--muted))' : 'transparent',
                      '&:hover': { backgroundColor: 'hsl(var(--muted))', opacity: 0.9 },
                    }}
                  >
                    <Box sx={{ color: 'hsl(var(--primary))', display: 'flex' }}>
                      <Target size={16} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inc.title}
                      </Typography>
                      <Typography sx={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inc.id}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}

          {/* Direct-match correlations — key equals the query. These are the
              most useful when analysts paste a thread_id or an identifier. */}
          {directMatchCorrelations.length > 0 && (
            <Box sx={{ px: 1.5, pt: 1.5, pb: 0.5 }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'hsl(var(--primary))', textTransform: 'uppercase', letterSpacing: 1, px: 1, mb: 0.5 }}>
                Direct match
              </Typography>
              {directMatchCorrelations.map((corr, idx) => {
                const globalIdx = directMatchStartIdx + idx;
                const refCount = corr.ref?.length || 0;
                return (
                  <Box
                    key={`direct-${corr.key}-${idx}`}
                    onClick={() => handleSelect({ type: 'correlation', correlation: corr })}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 1.5,
                      py: 1,
                      borderRadius: 1,
                      cursor: 'pointer',
                      backgroundColor: selectedIndex === globalIdx ? 'hsl(var(--muted))' : 'transparent',
                      '&:hover': { backgroundColor: 'hsl(var(--muted))', opacity: 0.9 },
                    }}
                  >
                    <Box sx={{ color: 'hsl(var(--primary))', display: 'flex' }}>
                      <Link2 size={16} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {corr.key}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                      <Typography sx={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))' }}>
                        {refCount} ref{refCount !== 1 ? 's' : ''}
                      </Typography>
                      {corr.amount > 1 && (
                        <Typography sx={{ fontSize: '0.6rem', color: 'hsl(var(--primary))', fontWeight: 600 }}>
                          ×{corr.amount}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}

          {/* Other correlations (observable values, IOCs, etc.) */}
          {otherCorrelations.length > 0 && (
            <Box sx={{ px: 1.5, pt: 1.5, pb: 0.5 }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 1, px: 1, mb: 0.5 }}>
                Correlations
              </Typography>
              {otherCorrelations.map((corr, idx) => {
                const globalIdx = correlationStartIdx + idx;
                const refCount = corr.ref?.length || 0;
                return (
                  <Box
                    key={`${corr.key}-${idx}`}
                    onClick={() => handleSelect({ type: 'correlation', correlation: corr })}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 1.5,
                      py: 1,
                      borderRadius: 1,
                      cursor: 'pointer',
                      backgroundColor: selectedIndex === globalIdx ? 'hsl(var(--muted))' : 'transparent',
                      '&:hover': { backgroundColor: 'hsl(var(--muted))', opacity: 0.9 },
                    }}
                  >
                    <Box sx={{ color: 'hsl(var(--muted-foreground))', display: 'flex' }}>
                      <Link2 size={16} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {corr.key}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                      <Typography sx={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))' }}>
                        {refCount} ref{refCount !== 1 ? 's' : ''}
                      </Typography>
                      {corr.amount > 1 && (
                        <Typography sx={{ fontSize: '0.6rem', color: 'hsl(var(--primary))', fontWeight: 600 }}>
                          ×{corr.amount}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}

          {/* Correlations loading indicator */}
          {correlationsLoading && correlationResults.length === 0 && incidentResults.length === 0 && query.trim().length >= 2 && (
            <Box sx={{ px: 1.5, pt: 1.5, pb: 0.5 }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 1, px: 1, mb: 0.5 }}>
                Correlations
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1 }}>
                <CircularProgress size={14} sx={{ color: 'hsl(var(--muted-foreground))' }} />
                <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))' }}>Searching...</Typography>
              </Box>
            </Box>
          )}

          {/* Apps section */}
          {appResults.length > 0 && (
            <Box sx={{ px: 1.5, pt: 1.5, pb: 1.5 }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: 1, px: 1, mb: 0.5 }}>
                Integrations
              </Typography>
              {appResults.map((app, idx) => {
                const globalIdx = appStartIdx + idx;
                return (
                  <Box
                    key={app.objectID}
                    onClick={() => handleSelect({ type: 'app', app })}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 1.5,
                      py: 1,
                      borderRadius: 1,
                      cursor: 'pointer',
                      backgroundColor: selectedIndex === globalIdx ? 'hsl(var(--muted))' : 'transparent',
                      '&:hover': { backgroundColor: 'hsl(var(--muted))', opacity: 0.9 },
                    }}
                  >
                    {app.image_url ? (
                      <img
                        src={app.image_url}
                        alt={app.name}
                        style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'contain', backgroundColor: 'rgba(255,255,255,0.05)', padding: 2 }}
                      />
                    ) : (
                      <Box sx={{ width: 20, height: 20, borderRadius: 0.5, backgroundColor: 'hsl(var(--muted))' }} />
                    )}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.85rem', color: 'hsl(var(--foreground))', textTransform: 'capitalize' }}>
                        {app.name.replace(/_/g, ' ')}
                      </Typography>
                    </Box>
                    {app.categories?.[0] && (
                      <Typography sx={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', flexShrink: 0 }}>
                        {app.categories[0]}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}

          {/* Empty state */}
          {query.trim() && filteredNav.length === 0 && docResults.length === 0 && appResults.length === 0 && correlationResults.length === 0 && workflowResults.length === 0 && incidentResults.length === 0 && !isAnyLoading && (
            <Box sx={{ px: 3, py: 4, textAlign: 'center' }}>
              <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.85rem' }}>
                No results for "{query}"
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
};