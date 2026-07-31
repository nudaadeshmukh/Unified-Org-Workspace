'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  useAuth,
  useOrgMembers,
  Card,
  Button,
  RoleGate,
  Select,
  Input,
  Textarea,
  Label,
  Badge,
  ShareManager,
} from '@froncort/ui';

const PR_STATUS_TONE = {
  DRAFT: 'soft',
  IN_REVIEW: 'green',
  APPROVED: 'green',
  REJECTED: 'soft',
  MERGED: 'soft',
};

// Only forward transitions a caller can trigger via PATCH { status } —
// mirrors pr.service.js's ALLOWED_TRANSITIONS exactly (DRAFT->IN_REVIEW,
// IN_REVIEW->REJECTED, APPROVED->REJECTED/MERGED). APPROVED->IN_REVIEW is
// system-driven only (a CHANGES_REQUESTED review), never a button here.
const NEXT_TRANSITIONS = {
  DRAFT: [{ status: 'IN_REVIEW', label: 'Submit for review' }],
  IN_REVIEW: [{ status: 'REJECTED', label: 'Reject' }],
  APPROVED: [
    { status: 'MERGED', label: 'Merge' },
    { status: 'REJECTED', label: 'Reject' },
  ],
  REJECTED: [],
  MERGED: [],
};

function memberLabel(userId, memberNames) {
  return memberNames?.[userId]?.name || `Member ${userId.slice(0, 8)}`;
}

export default function PRDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { apiFetch, activeOrgId, orgRole, userId } = useAuth();
  const { members, byId: memberNames } = useOrgMembers();

  const [pr, setPr] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [versions, setVersions] = useState([]);
  const [diffs, setDiffs] = useState({});
  const [loadingDiff, setLoadingDiff] = useState(null);

  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const [reviewerId, setReviewerId] = useState('');
  const [addingReviewer, setAddingReviewer] = useState(false);
  const [reviewerError, setReviewerError] = useState(null);

  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState(null);

  async function load() {
    const [prRes, versionsRes] = await Promise.all([
      apiFetch('pr', `/prs/${id}`),
      apiFetch('pr', `/prs/${id}/versions`),
    ]);
    if (!prRes.ok) {
      setNotFound(true);
      return;
    }
    setPr(prRes.body.data);
    setEditForm({ title: prRes.body.data.title, description: prRes.body.data.description });
    if (versionsRes.ok) setVersions(versionsRes.body.data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isOwner = pr ? pr.orgId === activeOrgId : false;
  const isAssignedReviewer = pr?.reviewers?.some((r) => r.userId === userId) ?? false;
  const reviewerOptions = members.filter((m) => m.role === 'REVIEWER');

  async function handleEditSave(e) {
    e.preventDefault();
    setSavingEdit(true);
    const res = await apiFetch('pr', `/prs/${id}`, { method: 'PATCH', body: editForm });
    setSavingEdit(false);
    if (res.ok) {
      setPr(res.body.data);
      load();
    }
  }

  async function handleTransition(status) {
    setTransitioning(true);
    const res = await apiFetch('pr', `/prs/${id}`, { method: 'PATCH', body: { status } });
    setTransitioning(false);
    if (res.ok) {
      setPr(res.body.data);
      load();
    }
  }

  async function handleRequiredApprovalsChange(value) {
    const res = await apiFetch('pr', `/prs/${id}`, {
      method: 'PATCH',
      body: { requiredApprovals: Number(value) },
    });
    if (res.ok) setPr(res.body.data);
  }

  async function handleDelete() {
    if (!confirm('Delete this pull request? This cannot be undone.')) return;
    const res = await apiFetch('pr', `/prs/${id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) router.push('/dashboard');
  }

  async function handleAddReviewer(e) {
    e.preventDefault();
    setReviewerError(null);
    setAddingReviewer(true);
    const res = await apiFetch('pr', `/prs/${id}/reviewers`, { method: 'POST', body: { userId: reviewerId } });
    setAddingReviewer(false);
    if (!res.ok) {
      setReviewerError(res.body?.error?.message || 'Could not add reviewer.');
      return;
    }
    setReviewerId('');
    load();
  }

  async function handleSubmitReview(status) {
    setReviewError(null);
    setSubmittingReview(true);
    const res = await apiFetch('pr', `/prs/${id}/reviews`, {
      method: 'POST',
      body: { status, comment: reviewComment || undefined },
    });
    setSubmittingReview(false);
    if (!res.ok) {
      setReviewError(res.body?.error?.message || 'Could not submit review.');
      return;
    }
    setReviewComment('');
    load();
  }

  async function handleViewDiff(versionNumber) {
    if (diffs[versionNumber]) return;
    setLoadingDiff(versionNumber);
    const res = await apiFetch('pr', `/prs/${id}/versions/${versionNumber}/diff`);
    setLoadingDiff(null);
    if (res.ok) {
      setDiffs((prev) => ({ ...prev, [versionNumber]: res.body.data }));
    } else {
      setDiffs((prev) => ({ ...prev, [versionNumber]: { error: res.body?.error?.message || 'No diff available.' } }));
    }
  }

  if (notFound) {
    return (
      <div>
        <p className="text-sm text-ink-mute">Pull request not found.</p>
        <Button variant="link" onClick={() => router.push('/dashboard')} className="mt-2">
          ← Back to pull requests
        </Button>
      </div>
    );
  }

  if (!pr) return <p className="text-sm text-ink-faint">Loading…</p>;

  const canReview =
    (pr.status === 'IN_REVIEW' || pr.status === 'APPROVED') &&
    isOwner &&
    (orgRole === 'ORG_ADMIN' || (orgRole === 'REVIEWER' && isAssignedReviewer));

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="link" onClick={() => router.push('/dashboard')} className="mb-4">
        ← Back to pull requests
      </Button>

      <Card className="mb-6 p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <Badge tone={PR_STATUS_TONE[pr.status] || 'soft'}>{pr.status}</Badge>
          <RoleGate allow={['ORG_ADMIN']} role={orgRole} isOwner={isOwner}>
            <Button variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          </RoleGate>
        </div>

        <RoleGate
          allow={['ORG_ADMIN']}
          role={orgRole}
          isOwner={isOwner && pr.status !== 'REJECTED' && pr.status !== 'MERGED'}
          fallback={
            <>
              <h1 className="mb-2 text-xl font-medium text-ink">{pr.title}</h1>
              <p className="mb-4 whitespace-pre-wrap text-sm text-ink-secondary">{pr.description}</p>
            </>
          }
        >
          <form onSubmit={handleEditSave} className="mb-4 flex flex-col gap-3">
            <div>
              <Label>Title</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                rows={4}
                required
              />
            </div>
            <p className="text-xs text-ink-faint">
              {pr.status === 'DRAFT'
                ? 'Saved in place while this PR is a draft.'
                : 'Saving now creates a new version rather than overwriting the current one.'}
            </p>
            <Button type="submit" variant="secondary" disabled={savingEdit} className="self-start">
              {savingEdit ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        </RoleGate>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Required approvals</Label>
            <RoleGate
              allow={['ORG_ADMIN']}
              role={orgRole}
              isOwner={isOwner}
              fallback={<p className="text-sm text-ink-mute">{pr.requiredApprovals}</p>}
            >
              <Input
                type="number"
                min={1}
                defaultValue={pr.requiredApprovals}
                onBlur={(e) => {
                  if (Number(e.target.value) !== pr.requiredApprovals) handleRequiredApprovalsChange(e.target.value);
                }}
              />
            </RoleGate>
          </div>
          <div>
            <Label>Author</Label>
            <p className="text-sm text-ink-mute">{memberLabel(pr.authorId, memberNames)}</p>
          </div>
        </div>

        <RoleGate allow={['ORG_ADMIN']} role={orgRole} isOwner={isOwner}>
          {NEXT_TRANSITIONS[pr.status]?.length > 0 && (
            <div className="mt-4 flex gap-3">
              {NEXT_TRANSITIONS[pr.status].map((t) => (
                <Button
                  key={t.status}
                  variant={t.status === 'REJECTED' ? 'danger' : 'primary'}
                  disabled={transitioning}
                  onClick={() => handleTransition(t.status)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          )}
        </RoleGate>
      </Card>

      <Card className="mb-6 p-6">
        <h2 className="mb-3 text-sm font-medium text-ink">Reviewers</h2>
        {(!pr.reviewers || pr.reviewers.length === 0) && (
          <p className="mb-3 text-sm text-ink-faint">No reviewers assigned.</p>
        )}
        <ul className="mb-3 flex flex-col gap-2">
          {pr.reviewers?.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-sm border border-hairline-cool px-3 py-2 text-sm">
              <span className="text-ink">{memberLabel(r.userId, memberNames)}</span>
              <span className="text-xs text-ink-faint">{new Date(r.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
        <RoleGate allow={['ORG_ADMIN']} role={orgRole} isOwner={isOwner}>
          <form onSubmit={handleAddReviewer} className="flex items-end gap-3">
            <div className="flex-1">
              <Label>Add reviewer</Label>
              {reviewerOptions.length > 0 ? (
                <Select value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} required>
                  <option value="">Select a reviewer…</option>
                  {reviewerOptions.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name} ({m.email})
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="text-sm text-ink-faint">No Reviewer-role members in this organization yet.</p>
              )}
            </div>
            <Button type="submit" variant="secondary" disabled={addingReviewer || !reviewerId}>
              {addingReviewer ? 'Adding…' : 'Add'}
            </Button>
          </form>
          {reviewerError && <p className="mt-2 text-sm text-red-600">{reviewerError}</p>}
        </RoleGate>
      </Card>

      <Card className="mb-6 p-6">
        <h2 className="mb-3 text-sm font-medium text-ink">Reviews</h2>
        {(!pr.reviews || pr.reviews.length === 0) && <p className="mb-3 text-sm text-ink-faint">No reviews yet.</p>}
        <ul className="mb-4 flex flex-col gap-2">
          {pr.reviews?.map((rv) => (
            <li key={rv.id} className="rounded-sm border border-hairline-cool bg-canvas-soft p-3 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-ink">{memberLabel(rv.reviewerId, memberNames)}</span>
                <Badge tone={rv.status === 'APPROVED' ? 'green' : 'soft'}>{rv.status}</Badge>
              </div>
              {rv.comment && <p className="whitespace-pre-wrap text-ink-secondary">{rv.comment}</p>}
              <p className="mt-1 text-xs text-ink-faint">{new Date(rv.createdAt).toLocaleString()}</p>
            </li>
          ))}
        </ul>
        {canReview && (
          <div>
            <Textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Optional comment…"
              rows={2}
              className="mb-3"
            />
            <div className="flex gap-3">
              <Button disabled={submittingReview} onClick={() => handleSubmitReview('APPROVED')}>
                Approve
              </Button>
              <Button variant="danger" disabled={submittingReview} onClick={() => handleSubmitReview('CHANGES_REQUESTED')}>
                Request changes
              </Button>
            </div>
            {reviewError && <p className="mt-2 text-sm text-red-600">{reviewError}</p>}
          </div>
        )}
      </Card>

      <Card className="mb-6 p-6">
        <h2 className="mb-3 text-sm font-medium text-ink">Versions</h2>
        {versions.length === 0 && <p className="text-sm text-ink-faint">No versions yet — versions start once a PR is submitted for review.</p>}
        <ul className="flex flex-col gap-3">
          {versions.map((v) => (
            <li key={v.id} className="rounded-sm border border-hairline-cool p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink">Version {v.versionNumber}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-ink-faint">{new Date(v.createdAt).toLocaleString()}</span>
                  {v.versionNumber > 1 && (
                    <Button
                      variant="link"
                      disabled={loadingDiff === v.versionNumber}
                      onClick={() => handleViewDiff(v.versionNumber)}
                    >
                      {diffs[v.versionNumber] ? 'Diff loaded' : loadingDiff === v.versionNumber ? 'Loading…' : 'View diff'}
                    </Button>
                  )}
                </div>
              </div>
              {diffs[v.versionNumber] && !diffs[v.versionNumber].error && (
                <pre className="mt-2 overflow-x-auto rounded-sm bg-canvas-night p-3 font-mono text-xs">
                  {diffs[v.versionNumber].removed.map((line, i) => (
                    <div key={`r${i}`} className="text-red-400">
                      - {line}
                    </div>
                  ))}
                  {diffs[v.versionNumber].added.map((line, i) => (
                    <div key={`a${i}`} className="text-primary">
                      + {line}
                    </div>
                  ))}
                </pre>
              )}
              {diffs[v.versionNumber]?.error && (
                <p className="mt-2 text-xs text-ink-faint">{diffs[v.versionNumber].error}</p>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <RoleGate allow={['ORG_ADMIN']} role={orgRole} isOwner={isOwner}>
        <Card className="p-6">
          <ShareManager service="pr" resourceBasePath={`/prs/${id}`} />
        </Card>
      </RoleGate>
    </div>
  );
}
