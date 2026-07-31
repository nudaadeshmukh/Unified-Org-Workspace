// Thin fetch wrapper shared by both frontend apps. Holds no token itself —
// the caller (AuthContext) always passes the current access token in, which
// is what keeps "access token lives in memory in React state, never in
// localStorage/sessionStorage" (CLAUDE.md rule #5) literally true: there is
// no module-level variable here a browser extension or XSS payload could
// read persistently.

export const SERVICE_URLS = {
  identity: process.env.NEXT_PUBLIC_IDENTITY_API_URL,
  ticket: process.env.NEXT_PUBLIC_TICKET_API_URL,
  pr: process.env.NEXT_PUBLIC_PR_API_URL,
  audit: process.env.NEXT_PUBLIC_AUDIT_API_URL,
};

export class SessionExpiredError extends Error {}

async function rawRequest(service, path, { method = 'GET', body, token, isFormData, responseType } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${SERVICE_URLS[service]}${path}`, {
    method,
    headers,
    // Only identity-service ever needs the httpOnly refresh cookie
    // (login/register/refresh/logout) — every other service call is
    // Bearer-token-only, per CLAUDE.md rule #6 (services verify, they never
    // touch session state).
    credentials: service === 'identity' ? 'include' : 'omit',
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
  });

  // The audit-log CSV export (`format=csv`) responds with text/csv, not
  // JSON — res.json() would throw and silently swallow the actual export.
  // Every other caller keeps the original JSON-or-null behavior.
  if (responseType === 'blob') {
    const blob = res.ok ? await res.blob() : null;
    return { status: res.status, ok: res.ok, blob };
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    // 204 No Content and similar — no body to parse.
  }

  return { status: res.status, ok: res.ok, body: json };
}

/**
 * @param {'identity'|'ticket'|'pr'|'audit'} service
 * @param {string} path
 * @param {{method?: string, body?: object|FormData, isFormData?: boolean}} [opts]
 * @param {{accessToken: string|null, refresh?: () => Promise<string|null>, onSessionExpired?: () => void}} auth
 */
export async function apiRequest(service, path, opts = {}, auth = {}) {
  let result = await rawRequest(service, path, { ...opts, token: auth.accessToken });

  // A 401 mid-session means the 15-minute access token expired, not that the
  // user's actually logged out — try exactly one silent refresh-and-retry
  // before giving up. This is what makes token refresh "silent" for every
  // API call, not just the one on page load.
  if (result.status === 401 && auth.refresh) {
    const newToken = await auth.refresh();
    if (!newToken) {
      auth.onSessionExpired?.();
      throw new SessionExpiredError('Session expired');
    }
    result = await rawRequest(service, path, { ...opts, token: newToken });
    if (result.status === 401) {
      auth.onSessionExpired?.();
      throw new SessionExpiredError('Session expired');
    }
  }

  return result;
}
