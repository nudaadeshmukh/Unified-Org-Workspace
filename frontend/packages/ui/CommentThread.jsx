'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { Textarea } from './Input';
import Button from './Button';

/**
 * Comment.authorId is a bare UUID — ticket-service has no cross-schema join
 * to identity-service's User table (CLAUDE.md: services only know their own
 * schema), and no endpoint exists anywhere in api_reference.md to resolve a
 * userId to a display name for a caller who isn't that org's admin. Rather
 * than invent one (CLAUDE.md rule #11), this shows "You" for the current
 * user's own comments and a short id fragment otherwise — flagged in
 * docs/project-progress.md as a real frontend/backend contract gap, not
 * silently smoothed over.
 */
function authorLabel(authorId, currentUserId) {
  if (authorId === currentUserId) return 'You';
  return `Member ${authorId.slice(0, 8)}`;
}

export default function CommentThread({ ticketId, canComment }) {
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
              <span className="text-xs font-medium text-ink">{authorLabel(c.authorId, userId)}</span>
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
