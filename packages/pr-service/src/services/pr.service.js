const crypto = require('crypto');
const { orgScope, identityClient, auditClient } = require('@froncort/shared');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');

const PR_NOT_FOUND = () => new AppError('Pull request not found', 404, 'NOT_FOUND');

// CLAUDE.md rule #9 is now locked: audit calls block, and happen BEFORE the
// corresponding database write. Thin pass-through — see identity-service's
// connection.service.js for the full rationale (same design, same wording).
async function logAudit(event) {
  return auditClient.log(event);
}

// Only these forward transitions are valid; REJECTED and MERGED are
// terminal (no outgoing transitions at all, checked separately in
// updatePR). DRAFT -> IN_REVIEW is "submit for review"; IN_REVIEW/APPROVED
// -> REJECTED is a manual reject; APPROVED -> MERGED is the merge action.
// APPROVED -> IN_REVIEW happens too (a CHANGES_REQUESTED review, or
// requiredApprovals being raised above the current approval count) but
// that's driven by recomputeApprovalStatus, never by a caller-supplied
// `status` value, so it's intentionally not listed here.
const ALLOWED_TRANSITIONS = {
  DRAFT: ['IN_REVIEW'],
  IN_REVIEW: ['REJECTED'],
  APPROVED: ['REJECTED', 'MERGED'],
};

/**
 * The single entry point for "can this caller see this PR, and how" — same
 * shape as ticket-service's resolveTicketAccess, reusing orgScope's 5-step
 * check rather than re-deriving it. Includes reviewers/reviews so
 * GET /prs/:id's response can show them without a dedicated (undocumented)
 * reviewer-list endpoint.
 *
 * Bug fixed post-Phase-4: role-gating for own-org access ("OA, REV (own
 * org)" per api_reference.md, SUPPORT_AGENT excluded) belongs HERE, on the
 * OWNER branch only — not as a router-level requireRole gate on the GET
 * routes. A blanket router gate rejected cross-org GUESTs before this
 * function's share-check logic ever ran, which broke legitimate share
 * access for a caller whose home-org role happens to be SUPPORT_AGENT.
 * CLAUDE.md is explicit that Guest access is defined by share/connection
 * state, never by role — see prs.routes.js's comment for the fix.
 * @returns {Promise<{pr: object|null, access: 'OWNER'|'VIEW_COMMENT'|null}>}
 */
async function resolvePRAccess(prId, caller) {
  const pr = await prisma.pullRequest.findUnique({
    where: { id: prId },
    include: { reviewers: true, reviews: true },
  });
  if (!pr) {
    return { pr: null, access: null };
  }

  if (orgScope.ownsResource(pr.orgId, caller.activeOrgId)) {
    // Own org, but pr-service's own-org visibility is "OA, REV" only — a
    // SUPPORT_AGENT in the PR's own org still gets no access (falls through
    // to null, same as any other non-owning, non-sharing caller; 404, not
    // 403, per CLAUDE.md rule #2).
    if (caller.orgRole === 'ORG_ADMIN' || caller.orgRole === 'REVIEWER') {
      return { pr, access: 'OWNER' };
    }
    return { pr, access: null };
  }

  // A caller with no active org (PSA) can hold no share — partnerOrgId is
  // always a real org ID, never null.
  if (!caller.activeOrgId) {
    return { pr, access: null };
  }

  const shareRow = await prisma.pRShare.findFirst({
    where: { prId, partnerOrgId: caller.activeOrgId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  const connectionApproved = shareRow
    ? await identityClient.checkConnectionApproved(pr.orgId, caller.activeOrgId)
    : false;

  const access = orgScope.checkShareAccess({
    resourceOrgId: pr.orgId,
    callerOrgId: caller.activeOrgId,
    shareRow,
    connectionApproved,
  });

  return { pr, access };
}

async function createPR(caller, { title, description, requiredApprovals }) {
  const prId = crypto.randomUUID();

  await logAudit({
    orgId: caller.activeOrgId,
    actorId: caller.id,
    action: 'PR_CREATED',
    entityType: 'PullRequest',
    entityId: prId,
    metadata: { title },
  });

  return prisma.pullRequest.create({
    data: {
      id: prId,
      orgId: caller.activeOrgId,
      title,
      description,
      authorId: caller.id,
      requiredApprovals: requiredApprovals || undefined,
    },
  });
}

/**
 * Own org's PRs (OA/REV only — SUPPORT_AGENT gets none, same role gate as
 * resolvePRAccess's OWNER branch) + anything actively shared with the
 * caller's org (unrestricted by the caller's home-org role — same rule as
 * ticket-service's listTickets: a share row alone isn't enough if the
 * connection was later revoked, but a SUPPORT_AGENT guest is not excluded
 * just for being SA at home).
 */
async function listPRs(caller) {
  if (!caller.activeOrgId) {
    return [];
  }

  const canSeeOwnOrgPRs = caller.orgRole === 'ORG_ADMIN' || caller.orgRole === 'REVIEWER';
  const own = canSeeOwnOrgPRs
    ? await prisma.pullRequest.findMany({
        where: { orgId: caller.activeOrgId },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  const shares = await prisma.pRShare.findMany({
    where: { partnerOrgId: caller.activeOrgId, revokedAt: null },
  });
  const sharedPRIds = [...new Set(shares.map((s) => s.prId))];

  let sharedPRs = [];
  if (sharedPRIds.length) {
    const candidates = await prisma.pullRequest.findMany({
      where: { id: { in: sharedPRIds } },
      orderBy: { createdAt: 'desc' },
    });

    const approvalCache = new Map();
    for (const pr of candidates) {
      if (!approvalCache.has(pr.orgId)) {
        approvalCache.set(pr.orgId, await identityClient.checkConnectionApproved(pr.orgId, caller.activeOrgId));
      }
      if (approvalCache.get(pr.orgId)) {
        sharedPRs.push(pr);
      }
    }
  }

  return [...own, ...sharedPRs];
}

/** GET /prs/:id — same BOLA discipline as ticket detail. */
async function getPRForViewing(prId, caller) {
  const { pr, access } = await resolvePRAccess(prId, caller);
  if (!pr || !access) {
    throw PR_NOT_FOUND();
  }
  return pr;
}

/**
 * Re-derives PR status from the current set of reviews after anything that
 * could change the outcome (a new review, or requiredApprovals changing).
 * Counts each reviewer's MOST RECENT review only — a reviewer who once
 * approved and later requested changes (or vice versa) should count as
 * their latest state, not be double-counted or stuck at a stale one.
 * Only acts while the PR is IN_REVIEW or APPROVED; DRAFT/REJECTED/MERGED
 * are left untouched (approvals are meaningless before review starts, and
 * terminal states don't get silently reopened by this path).
 */
async function recomputeApprovalStatus(pr, caller) {
  if (pr.status !== 'IN_REVIEW' && pr.status !== 'APPROVED') {
    return pr;
  }

  const reviews = await prisma.pRReview.findMany({ where: { prId: pr.id }, orderBy: { createdAt: 'asc' } });
  const latestByReviewer = new Map();
  for (const review of reviews) {
    latestByReviewer.set(review.reviewerId, review.status);
  }
  const approvedCount = [...latestByReviewer.values()].filter((s) => s === 'APPROVED').length;
  const shouldBeApproved = approvedCount >= pr.requiredApprovals;

  if (shouldBeApproved && pr.status !== 'APPROVED') {
    await logAudit({
      orgId: pr.orgId,
      actorId: caller.id,
      action: 'PR_APPROVED',
      entityType: 'PullRequest',
      entityId: pr.id,
      metadata: { approvedCount, requiredApprovals: pr.requiredApprovals },
    });
    return prisma.pullRequest.update({ where: { id: pr.id }, data: { status: 'APPROVED' } });
  }

  if (!shouldBeApproved && pr.status === 'APPROVED') {
    await logAudit({
      orgId: pr.orgId,
      actorId: caller.id,
      action: 'PR_STATUS_CHANGED',
      entityType: 'PullRequest',
      entityId: pr.id,
      metadata: { from: 'APPROVED', to: 'IN_REVIEW', reason: 'approval count fell below requiredApprovals' },
    });
    return prisma.pullRequest.update({ where: { id: pr.id }, data: { status: 'IN_REVIEW' } });
  }

  return pr;
}

/**
 * PATCH /prs/:id — OA of the PR's own org only (the table's "Author or OA"
 * collapses to just "OA" now that only ORG_ADMIN can ever author a PR — see
 * api_reference.md's Phase 4 note). If status is DRAFT: title/description
 * update in place. If IN_REVIEW or later: a content edit creates a new
 * PRVersion instead of overwriting. requiredApprovals and an explicit
 * `status` transition are both allowed alongside a content edit in the same
 * call.
 */
async function updatePR(prId, caller, updates) {
  const pr = await prisma.pullRequest.findUnique({ where: { id: prId } });
  if (!pr || !orgScope.ownsResource(pr.orgId, caller.activeOrgId)) {
    throw PR_NOT_FOUND();
  }

  if (updates.status !== undefined) {
    if (pr.status === 'REJECTED' || pr.status === 'MERGED') {
      throw new AppError('This PR is in a terminal state and cannot be transitioned further', 400, 'INVALID_TRANSITION');
    }
    const allowed = ALLOWED_TRANSITIONS[pr.status] || [];
    if (!allowed.includes(updates.status)) {
      throw new AppError(`Cannot transition from ${pr.status} to ${updates.status}`, 400, 'INVALID_TRANSITION');
    }
  }

  const hasContentEdit = updates.title !== undefined || updates.description !== undefined;
  if (hasContentEdit && (pr.status === 'REJECTED' || pr.status === 'MERGED')) {
    throw new AppError('Cannot edit a PR that has been rejected or merged', 400, 'INVALID_STATE');
  }

  let current = pr;

  if (hasContentEdit) {
    const newTitle = updates.title !== undefined ? updates.title : current.title;
    const newDescription = updates.description !== undefined ? updates.description : current.description;

    if (current.status === 'DRAFT') {
      current = await prisma.pullRequest.update({
        where: { id: prId },
        data: { title: newTitle, description: newDescription },
      });
    } else {
      const lastVersion = await prisma.pRVersion.findFirst({ where: { prId }, orderBy: { versionNumber: 'desc' } });
      const nextVersionNumber = lastVersion ? lastVersion.versionNumber + 1 : 1;
      await prisma.pRVersion.create({
        data: { prId, versionNumber: nextVersionNumber, title: newTitle, description: newDescription },
      });
      current = await prisma.pullRequest.update({
        where: { id: prId },
        data: { title: newTitle, description: newDescription },
      });
    }
  }

  if (updates.requiredApprovals !== undefined) {
    current = await prisma.pullRequest.update({
      where: { id: prId },
      data: { requiredApprovals: updates.requiredApprovals },
    });
    current = await recomputeApprovalStatus(current, caller);
  }

  if (updates.status !== undefined) {
    const fromStatus = current.status;

    // current.id already exists (this is an update, not a create) — audit
    // first, then the actual status write, per CLAUDE.md rule #9.
    await logAudit({
      orgId: current.orgId,
      actorId: caller.id,
      action: updates.status === 'MERGED' ? 'PR_MERGED' : 'PR_STATUS_CHANGED',
      entityType: 'PullRequest',
      entityId: current.id,
      metadata: { from: fromStatus, to: updates.status },
    });

    current = await prisma.pullRequest.update({ where: { id: prId }, data: { status: updates.status } });

    // Baseline snapshot the moment review starts — version 1 has no n-1 to
    // diff against by design (GET /versions/1/diff correctly 400s; see
    // docs/project-progress.md Phase 4 entry for the versioning scheme).
    // Not separately audited — no dedicated AuditAction exists for version
    // creation, same reasoning as content edits elsewhere in this function.
    if (updates.status === 'IN_REVIEW' && fromStatus === 'DRAFT') {
      await prisma.pRVersion.create({
        data: { prId, versionNumber: 1, title: current.title, description: current.description },
      });
    }
  }

  return current;
}

async function deletePR(prId, caller) {
  const pr = await prisma.pullRequest.findUnique({ where: { id: prId } });
  if (!pr || !orgScope.ownsResource(pr.orgId, caller.activeOrgId)) {
    throw PR_NOT_FOUND();
  }

  // No PR_DELETED value exists in AuditAction (unlike TICKET_DELETED, which
  // does) — the enum is locked, not something this phase can extend without
  // a schema migration outside Phase 4's scope. Reusing PR_STATUS_CHANGED
  // with an explicit `to: 'DELETED'` in metadata is the closest fit that
  // still shows up in the audit trail; flagged in docs/project-progress.md
  // as a real (if minor) gap for whoever next touches the audit schema.
  await logAudit({
    orgId: caller.activeOrgId,
    actorId: caller.id,
    action: 'PR_STATUS_CHANGED',
    entityType: 'PullRequest',
    entityId: prId,
    metadata: { title: pr.title, from: pr.status, to: 'DELETED' },
  });

  // Children reference PullRequest without ON DELETE CASCADE (default
  // RESTRICT) — same pattern as ticket-service's deleteTicket.
  await prisma.$transaction([
    prisma.pRVersion.deleteMany({ where: { prId } }),
    prisma.pRReviewer.deleteMany({ where: { prId } }),
    prisma.pRReview.deleteMany({ where: { prId } }),
    prisma.pRShare.deleteMany({ where: { prId } }),
    prisma.pullRequest.delete({ where: { id: prId } }),
  ]);
}

module.exports = {
  resolvePRAccess,
  createPR,
  listPRs,
  getPRForViewing,
  updatePR,
  deletePR,
  recomputeApprovalStatus,
  logAudit,
  PR_NOT_FOUND,
};
