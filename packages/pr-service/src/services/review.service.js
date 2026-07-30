const crypto = require('crypto');
const { orgScope } = require('@froncort/shared');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { PR_NOT_FOUND, logAudit, recomputeApprovalStatus } = require('./pr.service');

/**
 * POST /prs/:id/reviews — "REV assigned to this PR, or OA". Role is gated
 * at the router (ORG_ADMIN or REVIEWER); this confirms org membership and,
 * for a REVIEWER, that they're actually assigned to this specific PR (not
 * just any REVIEWER in the org) — both cases collapse to PR_NOT_FOUND (404)
 * on failure, never a 403, so a REVIEWER poking at a PR they're not
 * assigned to can't tell it exists (CLAUDE.md rule #2).
 */
async function submitReview(prId, caller, { status, comment }) {
  const pr = await prisma.pullRequest.findUnique({ where: { id: prId } });
  if (!pr || !orgScope.ownsResource(pr.orgId, caller.activeOrgId)) {
    throw PR_NOT_FOUND();
  }

  if (caller.orgRole === 'REVIEWER') {
    const assigned = await prisma.pRReviewer.findUnique({
      where: { prId_userId: { prId, userId: caller.id } },
    });
    if (!assigned) {
      throw PR_NOT_FOUND();
    }
  }
  // caller.orgRole === 'ORG_ADMIN' at this point (router already restricted
  // to ORG_ADMIN/REVIEWER) needs no further check beyond the org-ownership
  // one above — an OA can review any PR in their own org.

  if (pr.status !== 'IN_REVIEW' && pr.status !== 'APPROVED') {
    throw new AppError('Reviews can only be submitted while a PR is under review', 400, 'INVALID_STATE');
  }

  const reviewId = crypto.randomUUID();

  // CHANGES_REQUESTED is the only review outcome with its own dedicated
  // AuditAction (PR_CHANGES_REQUESTED) — a plain APPROVED review that
  // doesn't cross the approval threshold has no direct audit entry of its
  // own (only the resulting status flip does, via recomputeApprovalStatus
  // below); no generic "review submitted" action exists in the enum. Same
  // pre-existing design call as Phase 4, unaffected by this ordering fix.
  if (status === 'CHANGES_REQUESTED') {
    await logAudit({
      orgId: pr.orgId,
      actorId: caller.id,
      action: 'PR_CHANGES_REQUESTED',
      entityType: 'PRReview',
      entityId: reviewId,
      metadata: { prId },
    });
  }

  const review = await prisma.pRReview.create({
    data: { id: reviewId, prId, reviewerId: caller.id, status, comment: comment || null },
  });

  if (status === 'CHANGES_REQUESTED') {
    // "Any CHANGES_REQUESTED sets status back to IN_REVIEW regardless of
    // approval count" (api_reference.md) — unconditional, not routed through
    // recomputeApprovalStatus's threshold logic. Not separately audited —
    // this status flip is a direct consequence of the review already
    // audited above, not a second reportable action.
    if (pr.status !== 'IN_REVIEW') {
      await prisma.pullRequest.update({ where: { id: prId }, data: { status: 'IN_REVIEW' } });
    }
  } else {
    await recomputeApprovalStatus(pr, caller);
  }

  return review;
}

module.exports = { submitReview };
