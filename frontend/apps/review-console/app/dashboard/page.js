'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, PRCard, Button, RoleGate, Select, Input, Textarea, Label, Card } from '@froncort/ui';

const PR_STATUS_VALUES = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'MERGED'];

export default function PRListPage() {
  const { apiFetch, activeOrgId, orgRole } = useAuth();
  const router = useRouter();
  const [prs, setPrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', description: '', requiredApprovals: 1 });
  const [createError, setCreateError] = useState(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    // No status query param on GET /prs per api_reference.md (unlike
    // GET /tickets?status=) — filtered client-side below instead.
    const res = await apiFetch('pr', '/prs');
    if (res.ok) setPrs(res.body.data);
    setLoading(false);
  }

  // Re-fetches whenever the org switcher changes activeOrgId — same pattern
  // as Support Hub's ticket list.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    const res = await apiFetch('pr', '/prs', {
      method: 'POST',
      body: {
        title: createForm.title,
        description: createForm.description,
        requiredApprovals: Number(createForm.requiredApprovals) || undefined,
      },
    });
    setCreating(false);
    if (!res.ok) {
      setCreateError(res.body?.error?.message || 'Could not create pull request.');
      return;
    }
    setPrs((prev) => [res.body.data, ...prev]);
    setShowCreate(false);
    setCreateForm({ title: '', description: '', requiredApprovals: 1 });
  }

  const visiblePrs = statusFilter ? prs.filter((pr) => pr.status === statusFilter) : prs;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-medium text-ink">Pull Requests</h1>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
            <option value="">All statuses</option>
            {PR_STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <RoleGate allow={['ORG_ADMIN']} role={orgRole}>
            <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'Cancel' : 'New Pull Request'}</Button>
          </RoleGate>
        </div>
      </div>

      {showCreate && (
        <Card className="mb-6 p-6">
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Title</Label>
              <Input
                value={createForm.title}
                onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Description</Label>
              <Textarea
                value={createForm.description}
                onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                required
              />
            </div>
            <div>
              <Label>Required approvals</Label>
              <Input
                type="number"
                min={1}
                value={createForm.requiredApprovals}
                onChange={(e) => setCreateForm((f) => ({ ...f, requiredApprovals: e.target.value }))}
              />
            </div>
            {createError && <p className="text-sm text-red-600 sm:col-span-2">{createError}</p>}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating…' : 'Create pull request'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading && <p className="text-sm text-ink-faint">Loading pull requests…</p>}
      {!loading && visiblePrs.length === 0 && <p className="text-sm text-ink-faint">No pull requests to show.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visiblePrs.map((pr) => (
          <PRCard
            key={pr.id}
            pr={pr}
            isShared={pr.orgId !== activeOrgId}
            onClick={() => router.push(`/dashboard/prs/${pr.id}`)}
          />
        ))}
      </div>
    </div>
  );
}
