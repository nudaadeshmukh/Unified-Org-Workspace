'use client';

import { useEffect, useState } from 'react';
import { useAuth, Card, Button, Input, Label, ConnectionStatusBadge } from '@froncort/ui';

// This screen manages the CURRENT org's connections (Support Hub's own org
// switcher decides which org that is) — it deliberately does not attempt a
// PSA "pick any org" view. PSA has no OrgMembership/activeOrgId by design
// (CLAUDE.md's Platform Super Admin scope), so "my org's connections" isn't
// a concept that applies to them here; a PSA console for arbitrary-org
// connection management isn't in Phase 7's documented scope.
export default function ConnectionsPage() {
  const { apiFetch, activeOrgId, orgRole, isPlatformAdmin } = useAuth();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [targetOrgId, setTargetOrgId] = useState('');
  const [error, setError] = useState(null);
  const [requesting, setRequesting] = useState(false);
  const [actingOn, setActingOn] = useState(null);

  const canManage = orgRole === 'ORG_ADMIN';

  async function load() {
    // GET /orgs/:id/connections is OA (or PSA) only per api_reference.md —
    // SUPPORT_AGENT/REVIEWER would just get a 403 here, so skip the request
    // entirely rather than show a misleading "no connections yet" for them.
    if (!activeOrgId || !canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await apiFetch('identity', `/orgs/${activeOrgId}/connections`);
    if (res.ok) setConnections(res.body.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId, canManage]);

  async function handleRequest(e) {
    e.preventDefault();
    setError(null);
    setRequesting(true);
    const res = await apiFetch('identity', `/orgs/${activeOrgId}/connections`, {
      method: 'POST',
      body: { targetOrgId },
    });
    setRequesting(false);
    if (!res.ok) {
      setError(res.body?.error?.message || 'Could not request connection.');
      return;
    }
    setConnections((prev) => [res.body.data, ...prev]);
    setTargetOrgId('');
  }

  async function respond(id, status) {
    setActingOn(id);
    const res = await apiFetch('identity', `/connections/${id}`, { method: 'PATCH', body: { status } });
    if (res.ok) setConnections((prev) => prev.map((c) => (c.id === id ? res.body.data : c)));
    setActingOn(null);
  }

  if (!activeOrgId) {
    return (
      <p className="text-sm text-ink-faint">
        {isPlatformAdmin
          ? 'Platform Super Admins have no home organization — switch to an org membership to manage its connections.'
          : 'No active organization.'}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-xl font-medium text-ink">Cross-Org Connections</h1>

      {canManage && (
        <Card className="mb-6 p-6">
          <h2 className="mb-3 text-sm font-medium text-ink">Request a new connection</h2>
          <p className="mb-3 text-sm text-ink-faint">
            There's no organization directory in this build — you'll need the target organization's ID from its
            admin.
          </p>
          <form onSubmit={handleRequest} className="flex items-end gap-3">
            <div className="flex-1">
              <Label>Target organization ID</Label>
              <Input value={targetOrgId} onChange={(e) => setTargetOrgId(e.target.value)} required />
            </div>
            <Button type="submit" disabled={requesting}>
              {requesting ? 'Requesting…' : 'Request'}
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </Card>
      )}

      {!canManage && (
        <p className="text-sm text-ink-faint">Only your org's admin can view or manage connections.</p>
      )}
      {canManage && loading && <p className="text-sm text-ink-faint">Loading connections…</p>}
      {canManage && !loading && connections.length === 0 && (
        <p className="text-sm text-ink-faint">No connections yet.</p>
      )}
      <ul className="flex flex-col gap-3">
        {connections.map((c) => {
          const isTarget = c.targetOrgId === activeOrgId;
          const isRequester = c.requesterOrgId === activeOrgId;
          return (
            <li key={c.id}>
              <Card className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-ink">
                    {isRequester ? 'Requested to' : 'Requested by'}: org{' '}
                    <span className="font-mono text-xs text-ink-mute">
                      {(isRequester ? c.targetOrgId : c.requesterOrgId).slice(0, 8)}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">{new Date(c.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <ConnectionStatusBadge status={c.status} />
                  {canManage && c.status === 'PENDING' && isTarget && (
                    <Button variant="secondary" disabled={actingOn === c.id} onClick={() => respond(c.id, 'APPROVED')}>
                      Approve
                    </Button>
                  )}
                  {canManage && c.status === 'APPROVED' && (
                    <Button variant="danger" disabled={actingOn === c.id} onClick={() => respond(c.id, 'REVOKED')}>
                      Revoke
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
