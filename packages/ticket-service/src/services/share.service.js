const crypto = require('crypto');
const { orgScope, identityClient } = require('@froncort/shared');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { logAudit, TICKET_NOT_FOUND } = require('./ticket.service');

/**
 * All 3 share routes are "OA (of the ticket's own org)" only — no PSA, no
 * REV/SA, no sharing-in via a share you're not the owner of. Role is gated
 * at the router (requireRole(['ORG_ADMIN'], { allowPlatformAdmin: false })),
 * so by the time this runs the caller is already confirmed an org admin
 * somewhere — this just confirms it's *this ticket's* org.
 */
function assertOwnTicket(ticket, caller) {
  if (!ticket || !orgScope.ownsResource(ticket.orgId, caller.activeOrgId)) {
    throw TICKET_NOT_FOUND();
  }
}

async function createShare(ticketId, caller, { partnerOrgId }) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  assertOwnTicket(ticket, caller);

  if (partnerOrgId === ticket.orgId) {
    throw new AppError('Cannot share a ticket with its own organization', 400, 'INVALID_TARGET');
  }

  // Must call identity-service's internal connection-status check first —
  // reject if not APPROVED (api_reference.md).
  const approved = await identityClient.checkConnectionApproved(ticket.orgId, partnerOrgId);
  if (!approved) {
    throw new AppError(
      'No approved connection exists between these organizations — request and approve one first',
      400,
      'CONNECTION_NOT_APPROVED'
    );
  }

  // Same lesson as Phase 2's OrgConnection duplicate-active guard: a revoked
  // share row may coexist with a fresh one for the same (ticketId,
  // partnerOrgId) pair, but two simultaneously *active* shares would be
  // ambiguous (which one governs access?) — block that up front.
  const existingActive = await prisma.ticketShare.findFirst({
    where: { ticketId, partnerOrgId, revokedAt: null },
  });
  if (existingActive) {
    throw new AppError('This ticket is already shared with that organization', 409, 'SHARE_ALREADY_ACTIVE');
  }

  const shareId = crypto.randomUUID();

  await logAudit({
    orgId: caller.activeOrgId,
    actorId: caller.id,
    action: 'TICKET_SHARED',
    entityType: 'TicketShare',
    entityId: shareId,
    metadata: { ticketId, partnerOrgId },
  });

  return prisma.ticketShare.create({
    data: { id: shareId, ticketId, partnerOrgId, sharedBy: caller.id },
  });
}

async function listShares(ticketId, caller) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  assertOwnTicket(ticket, caller);

  return prisma.ticketShare.findMany({ where: { ticketId }, orderBy: { createdAt: 'desc' } });
}

async function revokeShare(ticketId, shareId, caller) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  assertOwnTicket(ticket, caller);

  const share = await prisma.ticketShare.findUnique({ where: { id: shareId } });
  if (!share || share.ticketId !== ticketId) {
    throw new AppError('Share not found', 404, 'NOT_FOUND');
  }
  if (share.revokedAt) {
    throw new AppError('This share has already been revoked', 400, 'INVALID_TRANSITION');
  }

  await logAudit({
    orgId: caller.activeOrgId,
    actorId: caller.id,
    action: 'TICKET_SHARE_REVOKED',
    entityType: 'TicketShare',
    entityId: share.id,
    metadata: { ticketId, partnerOrgId: share.partnerOrgId },
  });

  return prisma.ticketShare.update({
    where: { id: shareId },
    data: { revokedAt: new Date() },
  });
}

module.exports = { createShare, listShares, revokeShare };
