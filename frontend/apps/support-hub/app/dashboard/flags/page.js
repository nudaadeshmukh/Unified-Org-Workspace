'use client';

import { useEffect, useState } from 'react';
import { useAuth, Card, Badge } from '@froncort/ui';

export default function FeatureFlagsPage() {
  const { apiFetch, activeOrgId, isPlatformAdmin } = useAuth();
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeOrgId) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const res = await apiFetch('ticket', `/orgs/${activeOrgId}/feature-flags`);
      if (res.ok) setFlags(res.body.data);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  if (!activeOrgId) {
    return (
      <p className="text-sm text-ink-faint">
        {isPlatformAdmin ? 'Platform Super Admins have no home organization.' : 'No active organization.'}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-medium text-ink">Feature Flags</h1>
      <p className="mb-6 text-sm text-ink-faint">Read-only — flags are set via seed data in this build.</p>
      {loading && <p className="text-sm text-ink-faint">Loading…</p>}
      {!loading && flags.length === 0 && <p className="text-sm text-ink-faint">No feature flags configured.</p>}
      <ul className="flex flex-col gap-2">
        {flags.map((f) => (
          <li key={f.id}>
            <Card className="flex items-center justify-between p-4">
              <span className="font-mono text-sm text-ink">{f.key}</span>
              <Badge tone={f.enabled ? 'green' : 'soft'}>{f.enabled ? 'Enabled' : 'Disabled'}</Badge>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
