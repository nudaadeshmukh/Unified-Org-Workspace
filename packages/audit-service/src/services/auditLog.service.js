const prisma = require('../lib/prisma');

/**
 * GET /audit-log's single scoped query. `orgId` is ALWAYS the caller's own
 * org, forced here server-side — never trusted from a query param, same
 * BOLA discipline as every other read endpoint in this project, applied to
 * an aggregation endpoint instead of a single resource. `userId` (if given)
 * filters by `actorId` — "show me what this user did," not a resource ID.
 * CSV export (auditLogRoutes) calls this exact function too, then just
 * serializes the same rows differently — one query path, not two that
 * could drift out of sync.
 */
async function queryAuditLog(caller, { userId, from, to, action }) {
  const where = {
    orgId: caller.activeOrgId,
    ...(userId ? { actorId: userId } : {}),
    ...(action ? { action } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };

  return prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' } });
}

const CSV_COLUMNS = ['id', 'orgId', 'actorId', 'action', 'entityType', 'entityId', 'metadata', 'createdAt'];

function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Reuses queryAuditLog's exact result rows — no second, parallel query. */
function toCsv(rows) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(
      CSV_COLUMNS.map((col) => {
        let value = row[col];
        if (col === 'metadata') {
          value = JSON.stringify(value ?? {});
        } else if (value instanceof Date) {
          // ISO 8601, not JS's default locale-dependent Date#toString() —
          // a CSV export needs to stay machine-parseable regardless of the
          // exporting server's local timezone.
          value = value.toISOString();
        }
        return csvEscape(value);
      }).join(',')
    );
  }
  return lines.join('\n');
}

module.exports = { queryAuditLog, toCsv };
