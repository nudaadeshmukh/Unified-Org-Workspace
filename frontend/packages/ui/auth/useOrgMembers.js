'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

/**
 * GET /orgs/:id/members is OA-or-PSA only (matches the other member-
 * management routes) — a SUPPORT_AGENT/REVIEWER caller gets a 403, so this
 * hook just resolves to an empty member list for them rather than erroring.
 * Every UI spot consuming `byId` already has a truncated-UUID/"You" fallback
 * for exactly this case (see CommentThread, ticket assignedTo display) —
 * this only upgrades the experience for OA callers within their own org.
 * Cross-org guest name resolution (a partner org's commenter) is out of
 * scope by design — this only ever fetches the CALLER's own active org.
 */
export function useOrgMembers() {
  const { apiFetch, activeOrgId, orgRole } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!activeOrgId || orgRole !== 'ORG_ADMIN') {
      setMembers([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    apiFetch('identity', `/orgs/${activeOrgId}/members`).then((res) => {
      if (cancelled) return;
      if (res.ok) setMembers(res.body.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [apiFetch, activeOrgId, orgRole]);

  const byId = Object.fromEntries(members.map((m) => [m.userId, m]));
  return { members, byId, loading };
}
