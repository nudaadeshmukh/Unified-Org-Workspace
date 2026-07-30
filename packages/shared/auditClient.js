// Calls audit-service's POST /internal/audit-events. Used by every mutation
// that's a reportable action — CLAUDE.md rule #9 (locked, no longer open):
// blocking, and called BEFORE the caller's own database mutation, in this
// order: generate the resource's ID client-side (already true everywhere —
// see Conventions, Prisma IDs are @default(uuid()) but generated in JS, not
// by the DB) -> call this -> only then write the resource row. If this
// throws, the caller must abort with no database write at all — never
// swallow the error here. This replaced the throwing "not implemented" stub
// used by Phases 2-4's swallow-and-warn stopgap.

// Thrown by log() on any failure (unreachable audit-service, non-2xx
// response, or timeout). A distinct class — not a bare Error — so each
// service's global error handler can map it to a specific, meaningful
// response (503, AUDIT_LOG_FAILED) instead of falling through to a generic
// 500 that gives the caller no signal about what actually failed.
class AuditLogError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuditLogError';
    this.statusCode = 503;
    this.code = 'AUDIT_LOG_FAILED';
  }
}

/**
 * @param {{orgId: string, actorId: string, action: string, entityType: string, entityId: string, metadata?: object}} event
 * @returns {Promise<void>}
 */
async function log(event) {
  const baseUrl = process.env.AUDIT_SERVICE_URL;
  const apiKey = process.env.INTERNAL_API_KEY;

  let res;
  try {
    res = await fetch(`${baseUrl}/internal/audit-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Api-Key': apiKey },
      body: JSON.stringify(event),
      // A hung audit-service must not hang the caller's mutation forever —
      // fail closed (throw) after a bounded wait instead.
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    throw new AuditLogError(`Audit log write failed — audit-service unreachable: ${err.message}`);
  }

  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      // response body wasn't JSON — fall through with detail left blank
    }
    throw new AuditLogError(`Audit log write failed — audit-service returned HTTP ${res.status} ${detail}`);
  }
}

module.exports = { log, AuditLogError };
