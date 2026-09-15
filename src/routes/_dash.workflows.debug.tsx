import { createFileRoute } from '@tanstack/react-router';
import { routeMeta } from '@/lib/routeMeta';
import WorkflowRunDebuggerPage from '@/pages/dashboard/WorkflowRunDebuggerPage';

export const Route = createFileRoute('/_dash/workflows/debug')({
  head: () =>
    routeMeta({
      title: 'Workflow Run Debugger',
      description: 'Search, filter, debug, and inspect workflow executions.',
      url: '/workflows/debug',
      noindex: true,
    }),
  component: WorkflowRunDebuggerPage,
});
