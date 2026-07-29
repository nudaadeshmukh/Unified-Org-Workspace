const { auditClient } = require('@froncort/shared');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');

const NOT_FOUND = () => new AppError('Organization not found', 404, 'NOT_FOUND');
const CONNECTION_NOT_FOUND = () => new AppError('Connection not found', 404, 'NOT_FOUND');

// audit-service doesn't exist until Phase 5 — auditClient.log() is still a
// throwing stub. A connection mutation that already succeeded must never be
// undone by an audit call failing, so this swallows and just surfaces a
// warning; confirm end-to-end once Phase 5 builds the real receiving endpoint
// (per implementation_guide.md's Phase 5 note).
async function logAudit(event) {
  try {
    await auditClient.log(event);
  } catch (err) {
    console.warn(
      '[identity-service] audit log call failed (expected until Phase 5 wires audit-service):',
      err.message
    );
  }
}

// POST /orgs/:id/connections is "OA (own org)" only — no PSA bypass, per
// api_reference.md. Deliberately stricter than org.service.js's admin check.
function assertOrgAdminStrict(caller, orgId) {
  if (caller.activeOrgId !== orgId || caller.orgRole !== 'ORG_ADMIN') throw NOT_FOUND();
}

// GET /orgs/:id/connections is "OA (own org) or PSA".
function assertOrgAdminOrPSA(caller, orgId) {
  if (caller.isPlatformAdmin) return;
  if (caller.activeOrgId !== orgId || caller.orgRole !== 'ORG_ADMIN') throw NOT_FOUND();
}

async function requestConnection(orgId, caller, { targetOrgId }) {
  assertOrgAdminStrict(caller, orgId);

  if (orgId === targetOrgId) {
    throw new AppError('An organization cannot connect to itself', 400, 'INVALID_TARGET');
  }
  const targetOrg = await prisma.organization.findUnique({ where: { id: targetOrgId } });
  if (!targetOrg) throw NOT_FOUND();

  // No DB-level constraint enforces this — Prisma's schema DSL can't express
  // a partial/filtered unique index (unique only while PENDING/APPROVED),
  // and hand-writing one via raw migration SQL risks `prisma migrate dev`'s
  // drift detection proposing a reset the next time schema.prisma changes.
  // Enforced here instead. A REVOKED row for this exact directed pair is
  // fine to coexist with a new request (that's the "brand-new PENDING
  // request" the spec requires after a revoke); an already-PENDING or
  // already-APPROVED one for this exact pair is not — that would be two
  // live connection objects representing the same relationship.
  const existingActive = await prisma.orgConnection.findFirst({
    where: { requesterOrgId: orgId, targetOrgId, status: { in: ['PENDING', 'APPROVED'] } },
  });
  if (existingActive) {
    throw new AppError(
      `A ${existingActive.status.toLowerCase()} connection already exists between these organizations`,
      409,
      'CONNECTION_ALREADY_ACTIVE'
    );
  }

  const connection = await prisma.orgConnection.create({
    data: { requesterOrgId: orgId, targetOrgId, status: 'PENDING' },
  });

  await logAudit({
    orgId,
    actorId: caller.id,
    action: 'CONNECTION_REQUESTED',
    entityType: 'OrgConnection',
    entityId: connection.id,
    metadata: { requesterOrgId: orgId, targetOrgId },
  });

  return connection;
}

async function listConnections(orgId, caller) {
  assertOrgAdminOrPSA(caller, orgId);

  return prisma.orgConnection.findMany({
    where: { OR: [{ requesterOrgId: orgId }, { targetOrgId: orgId }] },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * PATCH /connections/:id — "OA of the target org (approve) or OA of either
 * org (revoke)". No PSA bypass per api_reference.md — deliberate, unlike
 * most other org-scoped routes in this service.
 */
async function respondToConnection(connectionId, caller, { status }) {
  const connection = await prisma.orgConnection.findUnique({ where: { id: connectionId } });
  if (!connection) throw CONNECTION_NOT_FOUND();

  const isRequesterOrgAdmin =
    caller.activeOrgId === connection.requesterOrgId && caller.orgRole === 'ORG_ADMIN';
  const isTargetOrgAdmin =
    caller.activeOrgId === connection.targetOrgId && caller.orgRole === 'ORG_ADMIN';

  if (!isRequesterOrgAdmin && !isTargetOrgAdmin) {
    // Caller has no relationship to this connection at all — 404, not 403.
    throw CONNECTION_NOT_FOUND();
  }

  if (status === 'APPROVED') {
    if (!isTargetOrgAdmin) {
      throw new AppError('Only the target organization can approve this connection', 403, 'FORBIDDEN');
    }
    if (connection.status !== 'PENDING') {
      throw new AppError('Only a pending connection can be approved', 400, 'INVALID_TRANSITION');
    }
  } else if (status === 'REVOKED') {
    if (connection.status !== 'APPROVED') {
      throw new AppError('Only an approved connection can be revoked', 400, 'INVALID_TRANSITION');
    }
  }

  const updated = await prisma.orgConnection.update({ where: { id: connectionId }, data: { status } });

  await logAudit({
    orgId: caller.activeOrgId,
    actorId: caller.id,
    action: status === 'APPROVED' ? 'CONNECTION_APPROVED' : 'CONNECTION_REVOKED',
    entityType: 'OrgConnection',
    entityId: updated.id,
    metadata: { requesterOrgId: updated.requesterOrgId, targetOrgId: updated.targetOrgId, status },
  });

  return updated;
}

/**
 * Used by ticket-service/pr-service (via internal API key) before creating
 * a cross-org share, to confirm an APPROVED connection exists either way.
 */
async function checkStatusBetween(orgA, orgB) {
  const connection = await prisma.orgConnection.findFirst({
    where: {
      status: 'APPROVED',
      OR: [
        { requesterOrgId: orgA, targetOrgId: orgB },
        { requesterOrgId: orgB, targetOrgId: orgA },
      ],
    },
  });
  return { approved: Boolean(connection), connectionId: connection ? connection.id : null };
}

module.exports = { requestConnection, listConnections, respondToConnection, checkStatusBetween };
