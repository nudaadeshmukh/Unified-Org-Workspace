import Card from './Card';
import { TicketStatusBadge, TicketPriorityBadge } from './Badge';

export default function TicketCard({ ticket, isShared, onClick }) {
  return (
    <Card
      className="cursor-pointer p-4 transition-colors hover:border-hairline-strong"
      onClick={onClick}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium text-ink">{ticket.title}</h3>
        {isShared && <span className="shrink-0 text-xs text-ink-faint">Shared with you</span>}
      </div>
      <p className="mb-3 line-clamp-2 text-sm text-ink-mute">{ticket.description}</p>
      <div className="flex items-center gap-2">
        <TicketStatusBadge status={ticket.status} />
        <TicketPriorityBadge priority={ticket.priority} />
      </div>
    </Card>
  );
}
