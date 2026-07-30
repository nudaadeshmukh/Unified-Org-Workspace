'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiRequest } from './apiClient';

const AuthContext = createContext(null);

// Client-side JWT payload decode for UI purposes only (which org is active,
// current role, PSA flag) — NOT a signature check. Every real request is
// still verified server-side with the RS256 public key; nothing here is a
// trust boundary.
function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  // apiFetch is called from effects/handlers that may run after several
  // re-renders — a ref avoids capturing a stale token in a closure created
  // before the most recent refresh/switch-org/login resolved.
  const tokenRef = useRef(null);
  tokenRef.current = accessToken;

  const claims = accessToken ? decodeJwtPayload(accessToken) : null;

  const refresh = useCallback(async () => {
    const res = await apiRequest('identity', '/auth/refresh', { method: 'POST' }, { accessToken: null });
    if (res.ok) {
      tokenRef.current = res.body.data.accessToken;
      setAccessToken(res.body.data.accessToken);
      return res.body.data.accessToken;
    }
    return null;
  }, []);

  const logout = useCallback(async () => {
    if (tokenRef.current) {
      try {
        await apiRequest('identity', '/auth/session', { method: 'DELETE' }, { accessToken: tokenRef.current });
      } catch {
        // Best-effort — clear local state regardless of whether the server
        // call succeeded (e.g. identity-service unreachable).
      }
    }
    tokenRef.current = null;
    setAccessToken(null);
    setUser(null);
    setMemberships([]);
  }, []);

  const apiFetch = useCallback(
    (service, path, opts) =>
      apiRequest(service, path, opts, { accessToken: tokenRef.current, refresh, onSessionExpired: logout }),
    [refresh, logout]
  );

  // Silent refresh on load, via the shared httpOnly refresh cookie — the app
  // never reads a stored token; it asks identity-service "am I still logged
  // in" on every fresh page load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await refresh();
      if (token && !cancelled) {
        const me = await apiRequest(
          'identity',
          '/auth/me',
          {},
          { accessToken: token, refresh, onSessionExpired: logout }
        );
        if (me.ok && !cancelled) {
          setUser(me.body.data.user);
          setMemberships(me.body.data.memberships);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await apiRequest(
      'identity',
      '/auth/login',
      { method: 'POST', body: { email, password } },
      { accessToken: null }
    );
    if (res.ok) {
      tokenRef.current = res.body.data.accessToken;
      setAccessToken(res.body.data.accessToken);
      setUser(res.body.data.user);
      setMemberships(res.body.data.memberships);
    }
    return res;
  }, []);

  const register = useCallback(async ({ email, password, name, orgName }) => {
    const res = await apiRequest(
      'identity',
      '/auth/register',
      { method: 'POST', body: { email, password, name, orgName } },
      { accessToken: null }
    );
    if (res.ok) {
      tokenRef.current = res.body.data.accessToken;
      setAccessToken(res.body.data.accessToken);
      setUser(res.body.data.user);
      setMemberships(res.body.data.memberships);
    }
    return res;
  }, []);

  const switchOrg = useCallback(
    async (orgId) => {
      const res = await apiFetch('identity', '/auth/switch-org', { method: 'POST', body: { orgId } });
      if (res.ok) {
        tokenRef.current = res.body.data.accessToken;
        setAccessToken(res.body.data.accessToken);
      }
      return res;
    },
    [apiFetch]
  );

  const value = {
    isAuthenticated: Boolean(accessToken),
    loading,
    user,
    memberships,
    activeOrgId: claims?.activeOrgId ?? null,
    orgRole: claims?.orgRole ?? null,
    isPlatformAdmin: claims?.isPlatformAdmin ?? false,
    userId: claims?.id ?? null,
    login,
    register,
    logout,
    switchOrg,
    apiFetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
