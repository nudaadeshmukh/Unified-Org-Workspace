// Calls audit-service's POST /internal/audit-events. Used by every mutation
// that's a reportable action — see CLAUDE.md rule #9. Stubbed by ticket-service
// and pr-service in Phases 3/4 since audit-service isn't live until Phase 5;
// real implementation: Phase 5.

/**
 * @param {{orgId: string, actorId: string, action: string, entityType: string, entityId: string, metadata?: object}} event
 * @returns {Promise<void>}
 */
async function log(event) {
  throw new Error('auditClient.log() not implemented — see Phase 5');
}

module.exports = { log };
