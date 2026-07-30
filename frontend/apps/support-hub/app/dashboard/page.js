'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, TicketCard, Button, RoleGate, Select, Input, Textarea, Label, Card } from '@froncort/ui';

const STATUS_VALUES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const PRIORITY_VALUES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export default function TicketListPage() {
  const { apiFetch, activeOrgId, orgRole } = useAuth();
  const router = useRouter();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', description: '', priority: 'MEDIUM', assignedTo: '' });
  const [createError, setCreateError] = useState(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const query = statusFilter ? `?status=${statusFilter}` : '';
    const res = await apiFetch('ticket', `/tickets${query}`);
    if (res.ok) setTickets(res.body.data);
    setLoading(false);
  }

  // Re-fetches whenever the org switcher changes activeOrgId, or the status
  // filter changes — the whole point of wiring the switcher to a real
  // refetch rather than just relabeling the header.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId, statusFilter]);

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    const res = await apiFetch('ticket', '/tickets', {
      method: 'POST',
      body: {
        title: createForm.title,
        description: createForm.description,
        priority: createForm.priority,
        assignedTo: createForm.assignedTo || undefined,
      },
    });
    setCreating(false);
    if (!res.ok) {
      setCreateError(res.body?.error?.message || 'Could not create ticket.');
      return;
    }
    setTickets((prev) => [res.body.data, ...prev]);
    setShowCreate(false);
    setCreateForm({ title: '', description: '', priority: 'MEDIUM', assignedTo: '' });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-medium text-ink">Tickets</h1>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
            <option value="">All statuses</option>
            {STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <RoleGate allow={['ORG_ADMIN', 'SUPPORT_AGENT']} role={orgRole}>
            <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'Cancel' : 'New Ticket'}</Button>
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
              <Label>Priority</Label>
              <Select
                value={createForm.priority}
                onChange={(e) => setCreateForm((f) => ({ ...f, priority: e.target.value }))}
              >
                {PRIORITY_VALUES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Assign to (member user ID, optional)</Label>
              <Input
                value={createForm.assignedTo}
                onChange={(e) => setCreateForm((f) => ({ ...f, assignedTo: e.target.value }))}
                placeholder="UUID of an existing org member"
              />
            </div>
            {createError && <p className="text-sm text-red-600 sm:col-span-2">{createError}</p>}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating…' : 'Create ticket'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading && <p className="text-sm text-ink-faint">Loading tickets…</p>}
      {!loading && tickets.length === 0 && <p className="text-sm text-ink-faint">No tickets to show.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tickets.map((t) => (
          <TicketCard
            key={t.id}
            ticket={t}
            isShared={t.orgId !== activeOrgId}
            onClick={() => router.push(`/dashboard/tickets/${t.id}`)}
          />
        ))}
      </div>
    </div>
  );
}
