'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { Textarea } from './Input';
import Button from './Button';

/**
 * Comment.authorId is a bare UUID — ticket-service has no cross-schema join
 * to identity-service's User table (CLAUDE.md: services only know their own
 * schema). `memberNames` (from useOrgMembers' `byId`, added after Phase 7)
 * resolves same-org authors to a real name; a cross-org guest's comment
 * (author outside the viewer's org — memberNames only ever covers the
 * viewer's own org) or an org whose caller isn't OA (memberNames is empty
 * for non-OA callers, since GET /orgs/:id/members is OA-or-PSA only) still
 * falls back to a short id fragment — an accepted, documented gap, not
 * silently smoothed over.
 */
function authorLabel(authorId, currentUserId, memberNames) {
  if (authorId === currentUserId) return 'You';
  const name = memberNames?.[authorId]?.name;
  if (name) return name;
  return `Member ${authorId.slice(0, 8)}`;
}

export default function CommentThread({ ticketId, canComment, memberNames }) {
  const { apiFetch, userId } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const res = await apiFetch('ticket', `/tickets/${ticketId}/comments`);
    if (res.ok) setComments(res.body.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSubmitting(true);
    const res = await apiFetch('ticket', `/tickets/${ticketId}/comments`, {
      method: 'POST',
      body: { body: draft },
    });
    if (res.ok) {
      setComments((prev) => [...prev, res.body.data]);
      setDraft('');
    }
    setSubmitting(false);
  }

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-ink">Comments</h3>
      {loading && <p className="text-sm text-ink-faint">Loading comments…</p>}
      {!loading && comments.length === 0 && <p className="text-sm text-ink-faint">No comments yet.</p>}
      <ul className="mb-4 flex flex-col gap-3">
        {comments.map((c) => (
          <li key={c.id} className="rounded-sm border border-hairline-cool bg-canvas-soft p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-ink">{authorLabel(c.authorId, userId, memberNames)}</span>
              <span className="text-xs text-ink-faint">{new Date(c.createdAt).toLocaleString()}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink-secondary">{c.body}</p>
          </li>
        ))}
      </ul>
      {canComment && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            rows={3}
          />
          <Button type="submit" disabled={submitting || !draft.trim()} className="self-end">
            {submitting ? 'Posting…' : 'Post comment'}
          </Button>
        </form>
      )}
    </div>
  );
}
