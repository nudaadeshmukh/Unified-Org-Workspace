const prisma = require('../lib/prisma');

/**
 * POST /internal/audit-events' write path. The caller (identity-service,
 * ticket-service, pr-service) already generated `entityId` client-side
 * before this call — CLAUDE.md rule #9's audit-before-mutation ordering
 * depends on that being true, since this write must complete before the
 * caller's own resource row is created/updated/deleted.
 */
async function recordEvent({ orgId, actorId, action, entityType, entityId, metadata }) {
  return prisma.auditLog.create({
    data: { orgId, actorId, action, entityType, entityId, metadata: metadata || undefined },
  });
}

module.exports = { recordEvent };
