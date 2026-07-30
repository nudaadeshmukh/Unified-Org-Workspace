const { orgScope, identityClient } = require('@froncort/shared');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { PR_NOT_FOUND } = require('./pr.service');

/**
 * POST /prs/:id/reviewers — "OA or author (own org)", which collapses to
 * just "OA of this PR's org" now that only ORG_ADMIN can ever author a PR
 * (see api_reference.md's Phase 4 note). Role is already gated at the
 * router; this confirms it's *this PR's* org.
 */
async function assertOwnPR(prId, caller) {
  const pr = await prisma.pullRequest.findUnique({ where: { id: prId } });
  if (!pr || !orgScope.ownsResource(pr.orgId, caller.activeOrgId)) {
    throw PR_NOT_FOUND();
  }
  return pr;
}

/**
 * "Must be a REV in that org" (api_reference.md) — verified against
 * identity-service's GET /internal/users/:userId/org-role, added in Phase 4
 * specifically for this check. Never trust a role claim from the request
 * body; identityClient.getUserOrgRole fails closed (an unreachable
 * identity-service reads as "not a reviewer", never "verified").
 */
async function addReviewer(prId, caller, { userId }) {
  const pr = await assertOwnPR(prId, caller);

  const { role } = await identityClient.getUserOrgRole(userId, pr.orgId);
  if (role !== 'REVIEWER') {
    throw new AppError('Target user is not a Reviewer in this organization', 400, 'INVALID_REVIEWER');
  }

  const existing = await prisma.pRReviewer.findUnique({
    where: { prId_userId: { prId, userId } },
  });
  if (existing) {
    throw new AppError('This user is already assigned as a reviewer on this PR', 409, 'ALREADY_ASSIGNED');
  }

  return prisma.pRReviewer.create({ data: { prId, userId } });
}

module.exports = { addReviewer };
