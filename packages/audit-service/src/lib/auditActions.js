// Must match schema.prisma's AuditAction enum exactly. Kept as a literal
// list (not derived from the Prisma client at runtime) so both a bad
// POST /internal/audit-events call and a bad GET /audit-log?action= filter
// get a clean 400 via zod, not a raw Prisma enum-constraint error.
const AUDIT_ACTIONS = [
  'TICKET_CREATED',
  'TICKET_UPDATED',
  'TICKET_DELETED',
  'TICKET_SHARED',
  'TICKET_SHARE_REVOKED',
  'COMMENT_ADDED',
  'ATTACHMENT_ADDED',
  'PR_CREATED',
  'PR_STATUS_CHANGED',
  'PR_APPROVED',
  'PR_CHANGES_REQUESTED',
  'PR_MERGED',
  'PR_SHARED',
  'PR_SHARE_REVOKED',
  'CONNECTION_REQUESTED',
  'CONNECTION_APPROVED',
  'CONNECTION_REVOKED',
];

module.exports = { AUDIT_ACTIONS };
