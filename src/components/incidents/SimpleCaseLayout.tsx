import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { FileText, ListChecks, ScanEye, GitBranch } from 'lucide-react';
import type { IncidentTask } from '@/config/ocsfIncidentSchema';

interface SimpleCaseLayoutProps {
  narrativeLabel: string;
  overview?: ReactNode;
  narrative: ReactNode;
  timeline: ReactNode;
  tasks: ReactNode;
  observables: ReactNode;
  correlations: ReactNode;
  taskItems: IncidentTask[];
  observableCount: number;
  correlationCount: number;
}

const SECTIONS = ['narrative', 'tasks', 'observables', 'correlations'] as const;
type SectionKey = typeof SECTIONS[number];

const SECTION_ICONS: Record<SectionKey, typeof FileText> = {
  narrative: FileText,
  tasks: ListChecks,
  observables: ScanEye,
  correlations: GitBranch,
};

export const SimpleCaseLayout = ({
  narrativeLabel,
  overview,
  narrative,
  timeline,
  tasks,
  observables,
  correlations,
  taskItems,
  observableCount,
  correlationCount,
}: SimpleCaseLayoutProps) => {
  const [activeSection, setActiveSection] = useState<SectionKey>('narrative');
  const refs = useRef<Record<SectionKey, HTMLElement | null>>({
    narrative: null,
    tasks: null,
    observables: null,
    correlations: null,
  });

  useEffect(() => {
    const elements = SECTIONS.map((key) => refs.current[key]).filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      const key = visible?.target.getAttribute('data-simple-section') as SectionKey | null;
      if (key) setActiveSection(key);
    }, { rootMargin: '-18% 0px -68% 0px', threshold: 0 });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const scrollTo = (key: SectionKey, taskId?: string) => {
    const target = taskId
      ? document.querySelector(`[data-simple-task-id="${CSS.escape(taskId)}"]`)
      : refs.current[key];
    if (!(target instanceof HTMLElement)) return;
    setActiveSection(key);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // The timeline column is sticky, but before the page is scrolled its top
  // starts below the incident header, so a flat 100vh height overflows the
  // screen and hides the comment box. Measure the available space instead.
  const timelineColRef = useRef<HTMLDivElement | null>(null);
  const [timelineHeight, setTimelineHeight] = useState<number | null>(null);

  useEffect(() => {
    const findFeed = () => {
      const el = timelineColRef.current;
      const feed = el?.querySelector('[data-simple-timeline-feed]');
      return feed instanceof HTMLElement ? feed : null;
    };
    const update = () => {
      const el = timelineColRef.current;
      if (!el) return;
      const top = Math.max(el.getBoundingClientRect().top, 24);
      const next = Math.max(320, window.innerHeight - top - 24);
      // Page scrolling changes the available height for the sticky column,
      // which resizes the timeline's scroll box and makes its content appear
      // to drift. Only react to meaningful changes, and re-pin the feed to the
      // newest entry when it was already at the bottom.
      setTimelineHeight((prev) => {
        if (prev !== null && Math.abs(prev - next) < 8) return prev;
        const feed = findFeed();
        const wasAtBottom = feed
          ? feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48
          : false;
        if (wasAtBottom) {
          requestAnimationFrame(() => {
            const f = findFeed();
            if (f) f.scrollTop = f.scrollHeight;
          });
        }
        return next;
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, []);

  const openTasks = taskItems.filter((task) => !task.completed && !task.disabled);
  const sectionData: Array<{ key: SectionKey; label: string; count?: number; icon: typeof FileText }> = [
    { key: 'narrative', label: narrativeLabel, icon: SECTION_ICONS.narrative },
    { key: 'tasks', label: 'Tasks', count: openTasks.length, icon: SECTION_ICONS.tasks },
    { key: 'observables', label: 'Observables', count: observableCount, icon: SECTION_ICONS.observables },
    { key: 'correlations', label: 'Correlations', count: correlationCount, icon: SECTION_ICONS.correlations },
  ];

  const sectionSx = {
    scrollMarginTop: 88,
    pb: { xs: 4, md: 7 },
  } as const;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(180px, 220px) minmax(0, 1fr)', lg: 'minmax(220px, 260px) minmax(0, 1fr) minmax(180px, 220px)' }, gap: { xs: 3, md: 3 }, alignItems: 'start' }}>
      <Box ref={timelineColRef} sx={{ order: { xs: 2, md: 1 }, position: { md: 'sticky' }, top: { md: 24 }, minWidth: 0, height: { xs: 'auto', md: timelineHeight ? `${timelineHeight}px` : 'calc(100vh - 48px)' }, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', mb: 1.5, flexShrink: 0 }}>
          Timeline
        </Typography>
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {timeline}
        </Box>
      </Box>

      <Box sx={{ order: { xs: 1, md: 2 }, minWidth: 0, maxWidth: 820, width: '100%', mx: 'auto' }}>
        {/* Overview (source, title, severity/status/assignee) stays pinned to
            the top of the center column while the body scrolls. */}
        {overview && (
          <Box
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 3,
              bgcolor: 'hsl(var(--background))',
              pt: 1,
            }}
          >
            {overview}
          </Box>
        )}
        <Box id="simple-case-narrative" ref={(node: HTMLElement | null) => { refs.current.narrative = node; }} data-simple-section="narrative" sx={sectionSx}>
          <Typography component="h2" sx={{ fontSize: '1.15rem', fontWeight: 700, mb: 2.5 }}>{narrativeLabel}</Typography>
          {narrative}
        </Box>
        <Box id="simple-case-tasks" ref={(node: HTMLElement | null) => { refs.current.tasks = node; }} data-simple-section="tasks" sx={sectionSx}>
          <Typography component="h2" sx={{ fontSize: '1.15rem', fontWeight: 700, mb: 2.5 }}>Tasks</Typography>
          {tasks}
        </Box>
        <Box id="simple-case-observables" ref={(node: HTMLElement | null) => { refs.current.observables = node; }} data-simple-section="observables" sx={sectionSx}>
          <Typography component="h2" sx={{ fontSize: '1.15rem', fontWeight: 700, mb: 2.5 }}>Observables</Typography>
          {observables}
        </Box>
        <Box id="simple-case-correlations" ref={(node: HTMLElement | null) => { refs.current.correlations = node; }} data-simple-section="correlations" sx={{ ...sectionSx, pb: 2 }}>
          <Typography component="h2" sx={{ fontSize: '1.15rem', fontWeight: 700, mb: 2.5 }}>Correlations</Typography>
          {correlations}
        </Box>
      </Box>

      <Box component="nav" aria-label="Case contents" sx={{ display: { xs: 'none', lg: 'block' }, order: 3, position: 'sticky', top: 24, minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', mb: 1.25 }}>
          Contents
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
          {sectionData.map(({ key, label, count, icon: Icon }) => {
            const isActive = activeSection === key;
            return (
              <Button
                key={key}
                onClick={() => scrollTo(key)}
                sx={{
                  minHeight: 32,
                  justifyContent: 'flex-start',
                  gap: 1,
                  px: 1,
                  textTransform: 'none',
                  fontSize: '0.78rem',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                  borderRadius: 1,
                  '&:hover': { bgcolor: 'hsl(var(--muted) / 0.35)' },
                }}
              >
                <Icon size={14} style={{ color: isActive ? 'hsl(var(--primary))' : 'inherit', flexShrink: 0 }} />
                <Box component="span" sx={{ flex: 1, textAlign: 'left' }}>{label}</Box>
                {count !== undefined && <span>{count}</span>}
              </Button>
            );
          })}
        </Box>
        {openTasks.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', mb: 0.75 }}>
              Open tasks
            </Typography>
            {openTasks.slice(0, 8).map((task) => (
              <Button
                key={task.id}
                onClick={() => scrollTo('tasks', task.id)}
                title={task.title}
                sx={{ display: 'block', width: '100%', minHeight: 30, px: 1, textAlign: 'left', textTransform: 'none', color: 'hsl(var(--muted-foreground))', fontSize: '0.74rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {task.title}
              </Button>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default SimpleCaseLayout;