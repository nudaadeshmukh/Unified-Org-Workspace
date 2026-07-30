// entityId/actorId are raw UUIDs, same contract gap as CommentThread's
// authorId — no cross-schema name resolution exists, shown as-is (this is
// exactly the audience — OA/REV auditors — who'd reasonably want raw IDs
// anyway, unlike an end-user-facing comment thread).
export default function AuditLogTable({ rows }) {
  if (!rows.length) {
    return <p className="text-sm text-ink-faint">No audit events for this filter.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-sm border border-hairline">
      <table className="w-full text-left text-sm">
        <thead className="bg-canvas-soft text-xs uppercase tracking-wide text-ink-mute">
          <tr>
            <th className="px-3 py-2">Time</th>
            <th className="px-3 py-2">Action</th>
            <th className="px-3 py-2">Entity</th>
            <th className="px-3 py-2">Actor</th>
            <th className="px-3 py-2">Metadata</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-hairline-cool">
              <td className="px-3 py-2 text-ink-mute">{new Date(row.createdAt).toLocaleString()}</td>
              <td className="px-3 py-2 text-ink">{row.action}</td>
              <td className="px-3 py-2 text-ink-mute">
                {row.entityType} · {row.entityId.slice(0, 8)}
              </td>
              <td className="px-3 py-2 text-ink-mute">{row.actorId.slice(0, 8)}</td>
              <td className="max-w-xs truncate px-3 py-2 text-ink-faint">
                {row.metadata ? JSON.stringify(row.metadata) : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
