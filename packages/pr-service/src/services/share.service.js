const crypto = require('crypto');
const { orgScope, identityClient } = require('@froncort/shared');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { logAudit, PR_NOT_FOUND } = require('./pr.service');

/**
 * All 3 share routes are "OA (of the PR's own org)" only — same shape as
 * ticket-service's assertOwnTicket. Role is gated at the router
 * (requireRole(['ORG_ADMIN'], { allowPlatformAdmin: false })), so by the
 * time this runs the caller is already confirmed an org admin somewhere —
 * this just confirms it's *this PR's* org.
 */
function assertOwnPR(pr, caller) {
  if (!pr || !orgScope.ownsResource(pr.orgId, caller.activeOrgId)) {
    throw PR_NOT_FOUND();
  }
}

async function createShare(prId, caller, { partnerOrgId }) {
  const pr = await prisma.pullRequest.findUnique({ where: { id: prId } });
  assertOwnPR(pr, caller);

  if (partnerOrgId === pr.orgId) {
    throw new AppError('Cannot share a PR with its own organization', 400, 'INVALID_TARGET');
  }

  const approved = await identityClient.checkConnectionApproved(pr.orgId, partnerOrgId);
  if (!approved) {
    throw new AppError(
      'No approved connection exists between these organizations — request and approve one first',
      400,
      'CONNECTION_NOT_APPROVED'
    );
  }

  const existingActive = await prisma.pRShare.findFirst({
    where: { prId, partnerOrgId, revokedAt: null },
  });
  if (existingActive) {
    throw new AppError('This PR is already shared with that organization', 409, 'SHARE_ALREADY_ACTIVE');
  }

  const shareId = crypto.randomUUID();

  await logAudit({
    orgId: caller.activeOrgId,
    actorId: caller.id,
    action: 'PR_SHARED',
    entityType: 'PRShare',
    entityId: shareId,
    metadata: { prId, partnerOrgId },
  });

  return prisma.pRShare.create({
    data: { id: shareId, prId, partnerOrgId, sharedBy: caller.id },
  });
}

async function listShares(prId, caller) {
  const pr = await prisma.pullRequest.findUnique({ where: { id: prId } });
  assertOwnPR(pr, caller);

  return prisma.pRShare.findMany({ where: { prId }, orderBy: { createdAt: 'desc' } });
}

async function revokeShare(prId, shareId, caller) {
  const pr = await prisma.pullRequest.findUnique({ where: { id: prId } });
  assertOwnPR(pr, caller);

  const share = await prisma.pRShare.findUnique({ where: { id: shareId } });
  if (!share || share.prId !== prId) {
    throw new AppError('Share not found', 404, 'NOT_FOUND');
  }
  if (share.revokedAt) {
    throw new AppError('This share has already been revoked', 400, 'INVALID_TRANSITION');
  }

  await logAudit({
    orgId: caller.activeOrgId,
    actorId: caller.id,
    action: 'PR_SHARE_REVOKED',
    entityType: 'PRShare',
    entityId: share.id,
    metadata: { prId, partnerOrgId: share.partnerOrgId },
  });

  return prisma.pRShare.update({
    where: { id: shareId },
    data: { revokedAt: new Date() },
  });
}

module.exports = { createShare, listShares, revokeShare };
