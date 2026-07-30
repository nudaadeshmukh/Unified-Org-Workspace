const { PrismaClient } = require('../generated/prisma-client');

// Runtime connection: AUDIT_RUNTIME_DATABASE_URL, which connects as the
// restricted audit_writer role (CLAUDE.md rule #4) — INSERT+SELECT only on
// AuditLog, no UPDATE/DELETE at the DB permission level, not just by
// application-code convention. Migrations still run separately via
// AUDIT_DATABASE_URL (the owner connection) — see package.json's
// prisma:migrate script — this client is runtime-only.
// See packages/audit-service/prisma/append-only.sql for the GRANT/REVOKE
// script that creates this role; must be applied once per database before
// this connection will succeed.
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.AUDIT_RUNTIME_DATABASE_URL } },
});

module.exports = prisma;
