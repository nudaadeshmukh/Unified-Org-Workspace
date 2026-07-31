'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  useAuth,
  useOrgMembers,
  Card,
  Button,
  RoleGate,
  CommentThread,
  Select,
  Input,
  Label,
  TicketStatusBadge,
  TicketPriorityBadge,
} from '@froncort/ui';

const STATUS_VALUES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const PRIORITY_VALUES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export default function TicketDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { apiFetch, activeOrgId, orgRole, userId } = useAuth();
  const { members, byId: memberNames } = useOrgMembers();

  const [ticket, setTicket] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [savingField, setSavingField] = useState(null);

  async function load() {
    const [ticketRes, attachmentsRes] = await Promise.all([
      apiFetch('ticket', `/tickets/${id}`),
      apiFetch('ticket', `/tickets/${id}/attachments`),
    ]);
    if (!ticketRes.ok) {
      setNotFound(true);
      return;
    }
    setTicket(ticketRes.body.data);
    if (attachmentsRes.ok) setAttachments(attachmentsRes.body.data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isOwner = ticket ? ticket.orgId === activeOrgId : false;

  async function updateField(field, value) {
    setSavingField(field);
    const res = await apiFetch('ticket', `/tickets/${id}`, { method: 'PATCH', body: { [field]: value } });
    if (res.ok) setTicket(res.body.data);
    setSavingField(null);
  }

  async function handleDelete() {
    if (!confirm('Delete this ticket? This cannot be undone.')) return;
    const res = await apiFetch('ticket', `/tickets/${id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) router.push('/dashboard');
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiFetch('ticket', `/tickets/${id}/attachments`, {
      method: 'POST',
      body: formData,
      isFormData: true,
    });
    setUploading(false);
    if (!res.ok) {
      setUploadError(res.body?.error?.message || 'Upload failed.');
      return;
    }
    setAttachments((prev) => [res.body.data, ...prev]);
    setFile(null);
  }

  if (notFound) {
    return (
      <div>
        <p className="text-sm text-ink-mute">Ticket not found.</p>
        <Button variant="link" onClick={() => router.push('/dashboard')} className="mt-2">
          ← Back to tickets
        </Button>
      </div>
    );
  }

  if (!ticket) return <p className="text-sm text-ink-faint">Loading…</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="link" onClick={() => router.push('/dashboard')} className="mb-4">
        ← Back to tickets
      </Button>

      <Card className="mb-6 p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h1 className="text-xl font-medium text-ink">{ticket.title}</h1>
          <RoleGate allow={['ORG_ADMIN']} role={orgRole} isOwner={isOwner}>
            <Button variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          </RoleGate>
        </div>
        <p className="mb-4 whitespace-pre-wrap text-sm text-ink-secondary">{ticket.description}</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label>Status</Label>
            <RoleGate
              allow={['ORG_ADMIN', 'SUPPORT_AGENT']}
              role={orgRole}
              isOwner={isOwner}
              fallback={<TicketStatusBadge status={ticket.status} />}
            >
              <Select
                value={ticket.status}
                disabled={savingField === 'status'}
                onChange={(e) => updateField('status', e.target.value)}
              >
                {STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </RoleGate>
          </div>
          <div>
            <Label>Priority</Label>
            <RoleGate
              allow={['ORG_ADMIN', 'SUPPORT_AGENT']}
              role={orgRole}
              isOwner={isOwner}
              fallback={<TicketPriorityBadge priority={ticket.priority} />}
            >
              <Select
                value={ticket.priority}
                disabled={savingField === 'priority'}
                onChange={(e) => updateField('priority', e.target.value)}
              >
                {PRIORITY_VALUES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </RoleGate>
          </div>
          <div>
            <Label>Assigned to</Label>
            <RoleGate
              allow={['ORG_ADMIN', 'SUPPORT_AGENT']}
              role={orgRole}
              isOwner={isOwner}
              fallback={
                <p className="text-sm text-ink-mute">
                  {ticket.assignedTo
                    ? memberNames[ticket.assignedTo]?.name || `Member ${ticket.assignedTo.slice(0, 8)}`
                    : 'Unassigned'}
                </p>
              }
            >
              {members.length > 0 ? (
                <Select
                  value={ticket.assignedTo || ''}
                  disabled={savingField === 'assignedTo'}
                  onChange={(e) => updateField('assignedTo', e.target.value || null)}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name} ({m.role})
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  defaultValue={ticket.assignedTo || ''}
                  placeholder="Member user ID"
                  disabled={savingField === 'assignedTo'}
                  onBlur={(e) => {
                    if (e.target.value !== (ticket.assignedTo || '')) {
                      updateField('assignedTo', e.target.value || null);
                    }
                  }}
                />
              )}
            </RoleGate>
          </div>
        </div>
      </Card>

      <Card className="mb-6 p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">Attachments</h2>
        </div>
        {attachments.length === 0 && <p className="mb-3 text-sm text-ink-faint">No attachments.</p>}
        <ul className="mb-3 flex flex-col gap-2">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-sm border border-hairline-cool px-3 py-2 text-sm">
              <a
                href={`${process.env.NEXT_PUBLIC_TICKET_API_URL}${a.fileUrl}`}
                target="_blank"
                rel="noreferrer"
                className="text-ink underline-offset-2 hover:underline"
              >
                {a.fileName}
              </a>
              <span className="text-xs text-ink-faint">{(a.size / 1024).toFixed(1)} KB</span>
            </li>
          ))}
        </ul>
        <RoleGate allow={['ORG_ADMIN', 'SUPPORT_AGENT']} role={orgRole} isOwner={isOwner}>
          <form onSubmit={handleUpload} className="flex items-center gap-3">
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="text-sm text-ink-mute"
            />
            <Button type="submit" variant="secondary" disabled={!file || uploading}>
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
          </form>
          {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
        </RoleGate>
      </Card>

      <Card className="p-6">
        <CommentThread ticketId={id} canComment memberNames={memberNames} />
      </Card>
    </div>
  );
}
