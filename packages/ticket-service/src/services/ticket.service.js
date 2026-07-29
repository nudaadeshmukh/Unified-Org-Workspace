const { orgScope, identityClient, auditClient } = require('@froncort/shared');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');

const TICKET_NOT_FOUND = () => new AppError('Ticket not found', 404, 'NOT_FOUND');

// TEMPORARY, not the final design — same unresolved question flagged in
// identity-service's connection.service.js (see docs/project-progress.md
// Phase 2 patch round 2). Swallows because audit-service doesn't exist
// until Phase 5; Phase 5 must explicitly decide whether this becomes
// blocking (mutation fails if the audit write fails) to match CLAUDE.md
// rule #9's "before returning success" wording, or graceful-degradation is
// kept everywhere and CLAUDE.md is updated to say so.
async function logAudit(event) {
  try {
    await auditClient.log(event);
  } catch (err) {
    console.warn(
      '[ticket-service] audit log call failed (expected until Phase 5 wires audit-service):',
      err.message
    );
  }
}

/**
 * The single entry point for "can this caller see this ticket, and how."
 * Fetches the ticket, then resolves access via orgScope's pure 5-step
 * function — own org is checked first (cheap, no I/O) before ever paying
 * for a share-row lookup + internal connection-status call.
 * @returns {Promise<{ticket: object|null, access: 'OWNER'|'VIEW_COMMENT'|null}>}
 */
async function resolveTicketAccess(ticketId, caller) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    return { ticket: null, access: null };
  }

  if (orgScope.ownsResource(ticket.orgId, caller.activeOrgId)) {
    return { ticket, access: 'OWNER' };
  }

  // A caller with no active org (e.g. a Platform Super Admin — no
  // OrgMembership exists for PSAs by design, see CLAUDE.md's "Platform
  // Super Admin scope") can never hold a share: partnerOrgId is always a
  // real org ID, never null. Short-circuit here rather than letting Prisma
  // reject a null equality filter on a non-nullable column — caught live
  // during requireRole's fail-safe-default regression pass (PSA hitting
  // this endpoint 500'd instead of 404ing).
  if (!caller.activeOrgId) {
    return { ticket, access: null };
  }

  const shareRow = await prisma.ticketShare.findFirst({
    where: { ticketId, partnerOrgId: caller.activeOrgId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  // Only pay for the internal HTTP round-trip if there's a share row worth
  // checking a connection for at all.
  const connectionApproved = shareRow
    ? await identityClient.checkConnectionApproved(ticket.orgId, caller.activeOrgId)
    : false;

  const access = orgScope.checkShareAccess({
    resourceOrgId: ticket.orgId,
    callerOrgId: caller.activeOrgId,
    shareRow,
    connectionApproved,
  });

  return { ticket, access };
}

async function createTicket(caller, { title, description, priority, assignedTo }) {
  const ticket = await prisma.ticket.create({
    data: {
      orgId: caller.activeOrgId,
      title,
      description,
      priority: priority || undefined,
      assignedTo: assignedTo || null,
      createdBy: caller.id,
    },
  });

  await logAudit({
    orgId: caller.activeOrgId,
    actorId: caller.id,
    action: 'TICKET_CREATED',
    entityType: 'Ticket',
    entityId: ticket.id,
    metadata: { title: ticket.title, priority: ticket.priority },
  });

  return ticket;
}

/**
 * Own org's tickets + anything actively (non-revoked, APPROVED-connection)
 * shared with the caller's org. Rule #3's full chain applies here too, not
 * just on the detail endpoint — a share row alone is never enough if the
 * connection was later revoked.
 */
async function listTickets(caller, { status }) {
  // Same null-activeOrgId guard as resolveTicketAccess — a caller with no
  // org (PSA) owns nothing and can hold no share; querying with orgId/
  // partnerOrgId: null would otherwise throw (non-nullable columns).
  if (!caller.activeOrgId) {
    return [];
  }

  const statusFilter = status ? { status } : {};

  const own = await prisma.ticket.findMany({
    where: { orgId: caller.activeOrgId, ...statusFilter },
    orderBy: { createdAt: 'desc' },
  });

  const shares = await prisma.ticketShare.findMany({
    where: { partnerOrgId: caller.activeOrgId, revokedAt: null },
  });
  const sharedTicketIds = [...new Set(shares.map((s) => s.ticketId))];

  let sharedTickets = [];
  if (sharedTicketIds.length) {
    const candidates = await prisma.ticket.findMany({
      where: { id: { in: sharedTicketIds }, ...statusFilter },
      orderBy: { createdAt: 'desc' },
    });

    const approvalCache = new Map();
    for (const ticket of candidates) {
      if (!approvalCache.has(ticket.orgId)) {
        approvalCache.set(ticket.orgId, await identityClient.checkConnectionApproved(ticket.orgId, caller.activeOrgId));
      }
      if (approvalCache.get(ticket.orgId)) {
        sharedTickets.push(ticket);
      }
    }
  }

  return [...own, ...sharedTickets];
}

/**
 * GET /tickets/:id — the BOLA-critical endpoint. Returns null (route maps
 * to 404) whether the ticket doesn't exist at all or the caller has no
 * relationship to it — never distinguishable from the caller's side.
 */
async function getTicketForViewing(ticketId, caller) {
  const { ticket, access } = await resolveTicketAccess(ticketId, caller);
  if (!ticket || !access) {
    throw TICKET_NOT_FOUND();
  }
  return ticket;
}

/**
 * PATCH /tickets/:id — own org only, never via a share, regardless of what
 * access level a share might otherwise grant.
 */
async function updateTicket(ticketId, caller, updates) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || !orgScope.ownsResource(ticket.orgId, caller.activeOrgId)) {
    throw TICKET_NOT_FOUND();
  }

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status: updates.status ?? undefined,
      priority: updates.priority ?? undefined,
      assignedTo: updates.assignedTo === undefined ? undefined : updates.assignedTo,
    },
  });

  await logAudit({
    orgId: caller.activeOrgId,
    actorId: caller.id,
    action: 'TICKET_UPDATED',
    entityType: 'Ticket',
    entityId: updated.id,
    metadata: { changes: updates },
  });

  return updated;
}

async function deleteTicket(ticketId, caller) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || !orgScope.ownsResource(ticket.orgId, caller.activeOrgId)) {
    throw TICKET_NOT_FOUND();
  }

  // Children reference Ticket without ON DELETE CASCADE (default RESTRICT) —
  // clear them out first so the delete itself doesn't fail.
  await prisma.$transaction([
    prisma.comment.deleteMany({ where: { ticketId } }),
    prisma.attachment.deleteMany({ where: { ticketId } }),
    prisma.ticketShare.deleteMany({ where: { ticketId } }),
    prisma.ticket.delete({ where: { id: ticketId } }),
  ]);

  await logAudit({
    orgId: caller.activeOrgId,
    actorId: caller.id,
    action: 'TICKET_DELETED',
    entityType: 'Ticket',
    entityId: ticketId,
    metadata: { title: ticket.title },
  });
}

module.exports = {
  resolveTicketAccess,
  createTicket,
  listTickets,
  getTicketForViewing,
  updateTicket,
  deleteTicket,
  logAudit,
  TICKET_NOT_FOUND,
};
