// pill-tag-green / pill-tag-soft — the design system deliberately reserves
// every other accent color for chart points/logos, never system UI state
// (frontend_reference.md's "Don't introduce additional accent colors as
// system colors"), so status/priority are conveyed with this one green/grey
// two-tone vocabulary plus label text, not a rainbow of status colors.
const TONE_CLASSES = {
  green: 'bg-primary text-ink',
  soft: 'bg-canvas-soft text-ink-mute border border-hairline',
};

export default function Badge({ children, tone = 'soft', className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-normal ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

const TICKET_STATUS_TONE = {
  OPEN: 'soft',
  IN_PROGRESS: 'green',
  RESOLVED: 'soft',
  CLOSED: 'soft',
};

export function TicketStatusBadge({ status }) {
  return <Badge tone={TICKET_STATUS_TONE[status] || 'soft'}>{status}</Badge>;
}

export function TicketPriorityBadge({ priority }) {
  return <Badge tone={priority === 'URGENT' || priority === 'HIGH' ? 'green' : 'soft'}>{priority}</Badge>;
}

const CONNECTION_STATUS_TONE = {
  PENDING: 'soft',
  APPROVED: 'green',
  REVOKED: 'soft',
};

export function ConnectionStatusBadge({ status }) {
  return <Badge tone={CONNECTION_STATUS_TONE[status] || 'soft'}>{status}</Badge>;
}
