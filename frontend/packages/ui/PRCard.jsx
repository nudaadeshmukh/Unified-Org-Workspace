import Card from './Card';
import Badge from './Badge';

const PR_STATUS_TONE = {
  DRAFT: 'soft',
  IN_REVIEW: 'green',
  APPROVED: 'green',
  REJECTED: 'soft',
  MERGED: 'soft',
};

export default function PRCard({ pr, isShared, onClick }) {
  return (
    <Card className="cursor-pointer p-4 transition-colors hover:border-hairline-strong" onClick={onClick}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium text-ink">{pr.title}</h3>
        {isShared && <span className="shrink-0 text-xs text-ink-faint">Shared with you</span>}
      </div>
      <p className="mb-3 line-clamp-2 text-sm text-ink-mute">{pr.description}</p>
      <Badge tone={PR_STATUS_TONE[pr.status] || 'soft'}>{pr.status}</Badge>
    </Card>
  );
}
