/**
 * Shared in-memory state for tracking which incidents are currently resyncing.
 * Survives route navigations but resets on page refresh.
 */

type Listener = () => void;

const resyncingIds = new Set<string>();
const listeners = new Set<Listener>();
let snapshot: Set<string> = new Set();

const notify = () => {
  snapshot = new Set(resyncingIds);
  listeners.forEach(fn => fn());
};

export const resyncState = {
  add(id: string) {
    resyncingIds.add(id);
    notify();
  },
  remove(id: string) {
    resyncingIds.delete(id);
    notify();
  },
  has(id: string) {
    return resyncingIds.has(id);
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  /** Current snapshot — stable reference between mutations */
  getAll(): Set<string> {
    return snapshot;
  },
};

/** Sources that cannot be resynced because there is no upstream ticket to pull from. */
const NON_RESYNCABLE_SOURCES = ['manual', 'tenzir', 'shuffle', 'unknown', 'n/a'];

/**
 * Returns a human readable reason why the incident cannot be resynced,
 * or an empty string when resync is allowed.
 */
export const getResyncBlockedReason = (incident: any, isSaving = false): string => {
  if (isSaving) return 'Saving in progress — please wait';
  const source = (incident?.source || '').trim();
  if (!source) return 'No source app recorded — cannot resync';
  if (NON_RESYNCABLE_SOURCES.includes(source.toLowerCase())) {
    return `${source} incidents have no external source to resync from`;
  }
  const product = incident?.rawOCSF?.product || incident?.rawOCSF?.metadata?.product;
  const name = product?.name;
  if (name && (name === product?.id || name === product?.uid)) {
    return 'Source product metadata is incomplete — cannot resync';
  }
  return '';
};

/** Pulls the backend "reason" out of a categories/run response body. */
export const extractResyncFailureReason = (body: any): string => {
  if (!body || typeof body !== 'object') return '';
  const candidates = [
    body.reason,
    body.error,
    body.details,
    body.result?.reason,
    body.data?.reason,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return '';
};
