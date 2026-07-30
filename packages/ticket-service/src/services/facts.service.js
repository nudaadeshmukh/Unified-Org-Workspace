const prisma = require('../lib/prisma');

// "Assigned" and "overdue" are both scoped to tickets that still need
// action (OPEN/IN_PROGRESS) — a RESOLVED/CLOSED ticket assigned to someone
// isn't something they still need to act on, so it doesn't count toward
// either figure (matches the assignment's own digest example: "4 tickets
// assigned to you, 1 overdue" reads as open work, not lifetime history).
const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS'];

/**
 * GET /internal/facts/tickets?userId=&orgId= — pre-aggregated facts for
 * audit-service's AI digest job. Deliberately returns only two numbers, not
 * the underlying ticket rows — the digest prompt must be built from facts
 * only (CLAUDE.md/implementation_guide.md's Phase 5 constraint), and the
 * scoping has to happen here, before anything leaves this service, not be
 * relied on downstream.
 *
 * "Overdue" is a heuristic, not a literal due-date comparison — Ticket has
 * no due-date field in this schema. A ticket counts as overdue if it's
 * still OPEN/IN_PROGRESS and was created more than
 * TICKET_OVERDUE_THRESHOLD_DAYS days ago (default 3). Flagged for
 * docs/known-limitations.md at Phase 9.
 */
async function getTicketFacts(userId, orgId) {
  const assignedCount = await prisma.ticket.count({
    where: { orgId, assignedTo: userId, status: { in: OPEN_STATUSES } },
  });

  const thresholdDays = Number(process.env.TICKET_OVERDUE_THRESHOLD_DAYS) || 3;
  const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);

  const overdueCount = await prisma.ticket.count({
    where: {
      orgId,
      assignedTo: userId,
      status: { in: OPEN_STATUSES },
      createdAt: { lt: cutoff },
    },
  });

  return { assignedCount, overdueCount };
}

module.exports = { getTicketFacts };
