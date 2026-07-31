'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import Button from './Button';
import { Input, Label } from './Input';

/**
 * Cross-org sharing UI, generic across tickets and PRs — both share.service.js
 * implementations (ticket-service, pr-service) expose the identical
 * {id, partnerOrgId, sharedBy, createdAt, revokedAt} shape under
 * POST/GET/DELETE `${resourceBasePath}/shares`, so one component covers both
 * rather than duplicating near-identical markup per app. No org directory
 * exists (same gap noted for org connections in Phase 7) — target org ID is
 * necessarily free text, sourced out-of-band from the partner org's admin.
 */
export default function ShareManager({ service, resourceBasePath }) {
  const { apiFetch } = useAuth();
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [partnerOrgId, setPartnerOrgId] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState(null);

  async function load() {
    setLoading(true);
    const res = await apiFetch(service, `${resourceBasePath}/shares`);
    if (res.ok) setShares(res.body.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceBasePath]);

  async function handleShare(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await apiFetch(service, `${resourceBasePath}/shares`, {
      method: 'POST',
      body: { partnerOrgId },
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.body?.error?.message || 'Could not share.');
      return;
    }
    setShares((prev) => [res.body.data, ...prev]);
    setPartnerOrgId('');
  }

  async function handleRevoke(shareId) {
    setRevokingId(shareId);
    const res = await apiFetch(service, `${resourceBasePath}/shares/${shareId}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      setShares((prev) =>
        prev.map((s) => (s.id === shareId ? { ...s, revokedAt: new Date().toISOString() } : s))
      );
    }
    setRevokingId(null);
  }

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-ink">Cross-Org Sharing</h3>
      <p className="mb-3 text-sm text-ink-faint">
        There's no organization directory in this build — you'll need the target organization's ID from its admin.
      </p>
      <form onSubmit={handleShare} className="mb-3 flex items-end gap-3">
        <div className="flex-1">
          <Label>Partner organization ID</Label>
          <Input value={partnerOrgId} onChange={(e) => setPartnerOrgId(e.target.value)} required />
        </div>
        <Button type="submit" variant="secondary" disabled={submitting}>
          {submitting ? 'Sharing…' : 'Share'}
        </Button>
      </form>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-ink-faint">Loading shares…</p>}
      {!loading && shares.length === 0 && <p className="text-sm text-ink-faint">Not shared with any organization.</p>}
      <ul className="flex flex-col gap-2">
        {shares.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between rounded-sm border border-hairline-cool px-3 py-2 text-sm"
          >
            <div>
              <p className="text-ink">
                Org <span className="font-mono text-xs text-ink-mute">{s.partnerOrgId.slice(0, 8)}</span>
              </p>
              <p className="text-xs text-ink-faint">
                {s.revokedAt
                  ? `Revoked ${new Date(s.revokedAt).toLocaleString()}`
                  : `Shared ${new Date(s.createdAt).toLocaleString()}`}
              </p>
            </div>
            {!s.revokedAt && (
              <Button variant="danger" disabled={revokingId === s.id} onClick={() => handleRevoke(s.id)}>
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
