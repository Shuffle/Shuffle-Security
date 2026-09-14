/**
 * Cross-domain authentication handoff between Shuffle Security and Shuffle Core (shuffler.io).
 *
 * Exposes utilities to request a single-use exchange ticket and navigate to
 * Shuffle Core while ensuring the session cookie is properly established on .shuffler.io.
 */

import { toast } from '@/lib/toast';
import {
  getApiUrl,
  getAuthHeader,
  getSessionToken,
  isCloudDomain,
  isShuffleSecurityBackend,
} from '@/Shuffle-MCPs/api';
import { getShuffleCoreBaseUrl } from '@/lib/shuffleUrls';

export const UK_SHUFFLE_SECURITY_BASE = 'https://uk.shuffle.security';
export const UK_SHUFFLE_CORE_BASE = 'https://uk.shuffler.io';

export const UK_AUTH_HANDOFF_ENDPOINT = `${UK_SHUFFLE_SECURITY_BASE}/api/v1/auth/handoff`;
export const UK_AUTH_EXCHANGE_ENDPOINT = `${UK_SHUFFLE_CORE_BASE}/api/v1/auth/exchange`;

export { isShuffleSecurityBackend };

export interface HandoffOptions {
  /** Open in a new browser tab/window instead of navigating the current tab. */
  newTab?: boolean;
}

/**
 * Returns true if the given URL points to Shuffle Core (shuffler.io or configured core base).
 */
export const isShuffleCoreUrl = (url: string | undefined | null): boolean => {
  if (!url) return false;
  const coreBase = getShuffleCoreBaseUrl().toLowerCase();
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.startsWith(coreBase)) return true;

  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://shuffle.security';
    const parsed = new URL(url, origin);
    const host = parsed.hostname.toLowerCase();
    return host === 'shuffler.io' || host.endsWith('.shuffler.io');
  } catch {
    return false;
  }
};

/**
 * Builds the full destination URL for Shuffle Core from either an absolute URL or a path.
 */
export const resolveShuffleCoreTargetUrl = (destinationUrlOrPath: string): string => {
  const trimmed = (destinationUrlOrPath || '').trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const coreBase = getShuffleCoreBaseUrl();
  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${coreBase}${cleanPath}`;
};

/**
 * Requests an auth handoff ticket from the backend and navigates to Shuffle Core
 * via the ticket exchange endpoint.
 *
 * When using *.shuffle.security as backend (e.g. ca.shuffle.security, us.shuffle.security),
 * auth handoff ticket requests always go to UK (uk.shuffle.security), and ticket exchange requests
 * always go to UK (uk.shuffler.io). That is where auth actually occurs and gets distributed from.
 *
 * If handoff fails, auth is missing, or the destination domain does not exist/is being set up,
 * a clear error toast is displayed and navigation is prevented.
 *
 * @param destinationUrlOrPath The target path (e.g. `/new-dashboard`) or full URL on Shuffle Core.
 * @param options Navigation options (e.g. `{ newTab: true }`).
 * @returns Promise<boolean> True if handoff succeeded and redirect was initiated; false otherwise.
 */
export async function navigateToShuffleCore(
  destinationUrlOrPath: string,
  options?: HandoffOptions
): Promise<boolean> {
  const isNewTab = Boolean(options?.newTab);
  const targetUrl = resolveShuffleCoreTargetUrl(destinationUrlOrPath);

  // When opening in a new tab, open blank window immediately within user gesture to avoid popup blockers
  let popupWindow: Window | null = null;
  const popupName = `shuffle_handoff_${Date.now()}`;
  if (isNewTab && typeof window !== 'undefined') {
    popupWindow = window.open('about:blank', popupName);
    if (popupWindow) {
      try {
        popupWindow.name = popupName;
      } catch { /* ignore */ }
    }
  }

  let targetHost = '';
  try {
    targetHost = new URL(targetUrl).hostname.toLowerCase();
  } catch { /* ignore */ }
  const currentHost = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';

  const isShuffleBackend = isShuffleSecurityBackend();

  // On-prem / self-hosted environments share the same domain/host across frontends.
  // Because cookies are scoped to the hostname and ignore port numbers (RFC 6265),
  // the session cookie is already present in the browser and no auth handoff is needed.
  if ((!isCloudDomain() && !isShuffleBackend) || (targetHost && currentHost && targetHost === currentHost)) {
    if (popupWindow) {
      popupWindow.location.href = targetUrl;
    } else if (typeof window !== 'undefined') {
      window.location.href = targetUrl;
    }
    return true;
  }

  try {
    // When using *.shuffle.security as backend, auth handoff ticket requests must
    // ALWAYS go to UK (uk.shuffle.security). That is where auth actually occurs
    // and gets distributed from. Even if we are on ca.shuffle.security, it must
    // still use uk.shuffle.security and uk.shuffler.io as auth handoff endpoints.
    const handoffEndpoint = isShuffleBackend
      ? UK_AUTH_HANDOFF_ENDPOINT
      : getApiUrl('/api/v1/auth/handoff');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    };

    // Ensure session token is attached in Authorization header if present
    const sessionToken = getSessionToken();
    if (sessionToken && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    const response = await fetch(handoffEndpoint, {
      method: 'POST',
      credentials: 'include',
      headers,
    });

    if (!response.ok) {
      let reason = `Server error (${response.status})`;
      try {
        const errorData = await response.json();
        if (errorData?.reason) {
          reason = errorData.reason;
        }
      } catch {
        // use default reason
      }

      if (popupWindow) popupWindow.close();
      toast.error(`Authentication handoff failed: ${reason}`);
      return false;
    }

    const data = await response.json();
    if (!data?.success || !data?.ticket) {
      if (popupWindow) popupWindow.close();
      toast.error(`Authentication handoff failed: ${data?.reason || 'No ticket returned'}`);
      return false;
    }

    // Determine target Core base for exchange:
    // If we're using *.shuffle.security as backend, the exchange endpoint must ALWAYS be
    // uk.shuffler.io (https://uk.shuffler.io/api/v1/auth/exchange).
    // For on-prem / self-hosted instances, resolve from target URL or configured core base.
    let targetCoreBase = UK_SHUFFLE_CORE_BASE;
    if (!isShuffleBackend) {
      targetCoreBase = getShuffleCoreBaseUrl();
      try {
        const u = new URL(targetUrl);
        if (u.hostname === 'shuffler.io' || u.hostname.endsWith('.shuffler.io')) {
          targetCoreBase = `https://${u.hostname}`;
        }
      } catch { /* ignore */ }
    }

    // Use an auto-submitting POST form so ticket, user_id, and redirect do not leak in URL access logs
    if (typeof document !== 'undefined') {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `${targetCoreBase}/api/v1/auth/exchange`;
      if (popupWindow) {
        form.target = popupWindow.name || popupName;
      }

      const fields: Record<string, string> = {
        ticket: data.ticket,
        user_id: data.user_id || '',
        redirect: targetUrl,
      };

      for (const [key, value] of Object.entries(fields)) {
        if (!value) continue;
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }

      document.body.appendChild(form);
      form.submit();
      form.remove();
    } else {
      const fallbackUrl = `${targetCoreBase}/api/v1/auth/exchange?ticket=${encodeURIComponent(data.ticket)}&user_id=${encodeURIComponent(data.user_id || '')}&redirect=${encodeURIComponent(targetUrl)}`;
      if (popupWindow) {
        popupWindow.location.href = fallbackUrl;
      } else if (typeof window !== 'undefined') {
        window.location.href = fallbackUrl;
      }
    }

    return true;
  } catch (err: unknown) {
    if (popupWindow) popupWindow.close();
    const msg = err instanceof Error ? err.message : 'Network error';
    toast.error(`Failed to navigate to Shuffle Core: ${msg}`);
    return false;
  }
}
