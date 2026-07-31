'use client';

import { Input, Select } from './Input';
import Button from './Button';

const AUDIT_ACTIONS = [
  'TICKET_CREATED',
  'TICKET_UPDATED',
  'TICKET_DELETED',
  'TICKET_SHARED',
  'TICKET_SHARE_REVOKED',
  'COMMENT_ADDED',
  'ATTACHMENT_ADDED',
  'PR_CREATED',
  'PR_STATUS_CHANGED',
  'PR_APPROVED',
  'PR_CHANGES_REQUESTED',
  'PR_MERGED',
  'PR_SHARED',
  'PR_SHARE_REVOKED',
  'CONNECTION_REQUESTED',
  'CONNECTION_APPROVED',
  'CONNECTION_REVOKED',
];

export default function AuditFilterBar({ filters, onChange, onExportCsv }) {
  function set(key, value) {
    onChange({ ...filters, [key]: value || undefined });
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div className="w-40">
        <label className="mb-1 block text-xs font-medium text-ink-mute">Action</label>
        <Select value={filters.action || ''} onChange={(e) => set('action', e.target.value)}>
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-44">
        <label className="mb-1 block text-xs font-medium text-ink-mute">From</label>
        <Input type="date" value={filters.from || ''} onChange={(e) => set('from', e.target.value)} />
      </div>
      <div className="w-44">
        <label className="mb-1 block text-xs font-medium text-ink-mute">To</label>
        <Input type="date" value={filters.to || ''} onChange={(e) => set('to', e.target.value)} />
      </div>
      {onExportCsv && (
        <Button type="button" variant="secondary" onClick={onExportCsv}>
          Export CSV
        </Button>
      )}
    </div>
  );
}
