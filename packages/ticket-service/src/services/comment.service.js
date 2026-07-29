const prisma = require('../lib/prisma');
const { resolveTicketAccess, logAudit, TICKET_NOT_FOUND } = require('./ticket.service');

/**
 * POST /tickets/:id/comments — "OA, SA, REV (own org) OR GUEST (valid
 * share)". Any resolved access level (OWNER or VIEW_COMMENT) grants comment
 * rights — view+comment is the guest's full permission set, and within the
 * caller's own org, OA/SA/REV covers every OrgRole that exists.
 */
async function createComment(ticketId, caller, { body }) {
  const { ticket, access } = await resolveTicketAccess(ticketId, caller);
  if (!ticket || !access) {
    throw TICKET_NOT_FOUND();
  }

  const comment = await prisma.comment.create({
    data: { ticketId, authorId: caller.id, body },
  });

  await logAudit({
    orgId: caller.activeOrgId,
    actorId: caller.id,
    action: 'COMMENT_ADDED',
    entityType: 'Comment',
    entityId: comment.id,
    metadata: { ticketId },
  });

  return comment;
}

/** GET /tickets/:id/comments — same access rule as GET /tickets/:id. */
async function listComments(ticketId, caller) {
  const { ticket, access } = await resolveTicketAccess(ticketId, caller);
  if (!ticket || !access) {
    throw TICKET_NOT_FOUND();
  }

  return prisma.comment.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'asc' },
  });
}

module.exports = { createComment, listComments };
