const crypto = require('crypto');

/**
 * Codifies what Phase 5 (and its follow-up patch) already proved manually
 * twice via direct `psql -U audit_writer` sessions: UPDATE and DELETE
 * against audit.AuditLog are rejected at the DB permission level, not just
 * by application code choosing not to expose those operations. Connects as
 * audit_writer directly — the exact same runtime role/connection
 * audit-service itself uses (packages/audit-service/src/lib/prisma.js) —
 * against the isolated froncort_test database (see
 * scripts/setup-test-db.js, which applies the identical append-only.sql
 * grants there too).
 */
describe('audit-permissions.test.js', () => {
  // Required after tests/helpers/testEnv.js (Jest setupFiles) has already
  // pointed AUDIT_RUNTIME_DATABASE_URL at froncort_test.
  const { PrismaClient } = require('../packages/audit-service/src/generated/prisma-client');
  let prisma;
  let seededRowId;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: process.env.AUDIT_RUNTIME_DATABASE_URL } } });

    // A real row to attempt UPDATE/DELETE against — audit_writer itself has
    // INSERT, so this uses the same capability audit-service's normal write
    // path relies on, not an owner-privileged shortcut.
    seededRowId = crypto.randomUUID();
    await prisma.auditLog.create({
      data: {
        id: seededRowId,
        orgId: crypto.randomUUID(),
        actorId: crypto.randomUUID(),
        action: 'TICKET_CREATED',
        entityType: 'Ticket',
        entityId: crypto.randomUUID(),
        metadata: { note: 'audit-permissions.test.js fixture' },
      },
    });
  });

  afterAll(async () => {
    // Cleanup needs the OWNER connection — audit_writer has no DELETE, by
    // design, which this test itself is about to prove.
    const ownerPrisma = new PrismaClient({ datasources: { db: { url: process.env.AUDIT_DATABASE_URL } } });
    await ownerPrisma.auditLog.deleteMany({ where: { id: seededRowId } });
    await ownerPrisma.$disconnect();
    await prisma.$disconnect();
  });

  test('audit_writer can SELECT and INSERT (already exercised by the fixture above)', async () => {
    const row = await prisma.auditLog.findUnique({ where: { id: seededRowId } });
    expect(row).not.toBeNull();
    expect(row.action).toBe('TICKET_CREATED');
  });

  test('audit_writer UPDATE against AuditLog is rejected at the DB permission level', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "AuditLog" SET metadata = '{"tampered":true}'::jsonb WHERE id = $1`,
        seededRowId
      )
    ).rejects.toThrow(/permission denied/i);

    // Confirm the row is provably unchanged, not just that the statement
    // errored for some unrelated reason.
    const row = await prisma.auditLog.findUnique({ where: { id: seededRowId } });
    expect(row.metadata).toEqual({ note: 'audit-permissions.test.js fixture' });
  });

  test('audit_writer DELETE against AuditLog is rejected at the DB permission level', async () => {
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE id = $1`, seededRowId)).rejects.toThrow(
      /permission denied/i
    );

    // Confirm the row still exists.
    const row = await prisma.auditLog.findUnique({ where: { id: seededRowId } });
    expect(row).not.toBeNull();
  });
});
