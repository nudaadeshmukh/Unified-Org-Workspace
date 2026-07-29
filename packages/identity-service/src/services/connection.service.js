const { auditClient } = require('@froncort/shared');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');

const NOT_FOUND = () => new AppError('Organization not found', 404, 'NOT_FOUND');
const CONNECTION_NOT_FOUND = () => new AppError('Connection not found', 404, 'NOT_FOUND');

// TEMPORARY, not the final design — reconcile explicitly in Phase 5, don't
// just leave this as-is because it happens to work. Swallowing here is a
// Phase 2 stopgap forced by audit-service not existing yet (auditClient.log()
// is still a throwing stub); it is NOT the locked behavior. CLAUDE.md rule #9
// ("calls auditClient.log(...) before returning success to the caller") and
// the documented ticket/pr-service trade-off both point toward the audit
// write being synchronous and mutation-blocking once audit-service is real
// (a down/slow audit-service should fail the mutation, not silently lose the
// audit trail — this is an audit-integrity-graded assignment). When Phase 5
// wires the real endpoint, either switch this to blocking (rethrow instead of
// swallow) to match ticket/pr-service, or — if graceful degradation is
// deliberately kept — update CLAUDE.md rule #9 to say so explicitly so all
// three services are consistent instead of silently divergent.
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

// api_reference.md's connections table lists PSA for all 3 endpoints — the
// original Phase 2 build read POST /orgs/:id/connections and PATCH
// /connections/:id as PSA-excluded, but that was a misreading (invisible at
// the time because the old requireRole() bypassed PSA unconditionally
// regardless of what the table said; the fail-safe-default fix made it a
// real, visible regression). PSA manages orgs and cross-org connections per
// the assignment's own description of PSA's scope, same pattern as
// org.service.js's member-management checks. One shared helper now, used
// by requestConnection and listConnections alike — PSA acts on behalf of
// any org, member or not.
function assertOrgAdminOrPSA(caller, orgId) {
  if (caller.isPlatformAdmin) return;
  if (caller.activeOrgId !== orgId || caller.orgRole !== 'ORG_ADMIN') throw NOT_FOUND();
}

async function requestConnection(orgId, caller, { targetOrgId }) {
  assertOrgAdminOrPSA(caller, orgId);

  if (orgId === targetOrgId) {
    throw new AppError('An organization cannot connect to itself', 400, 'INVALID_TARGET');
  }
  const targetOrg = await prisma.organization.findUnique({ where: { id: targetOrgId } });
  if (!targetOrg) throw NOT_FOUND();

  // No DB-level constraint enforces this — Prisma's schema DSL can't express
  // a partial/filtered unique index (unique only while PENDING/APPROVED),
  // and hand-writing one via raw migration SQL risks `prisma migrate dev`'s
  // drift detection proposing a reset the next time schema.prisma changes.
  // Enforced here instead. A REVOKED row for this exact pair (either
  // direction) is fine to coexist with a new request (that's the "brand-new
  // PENDING request" the spec requires after a revoke); an already-PENDING
  // or already-APPROVED one is not — checked in BOTH directions, not just
  // this exact (requesterOrgId, targetOrgId) order. A connection is a
  // relationship between two orgs, not a per-direction thing: if Alpha→Beta
  // is APPROVED, a Beta→Alpha request must also be blocked, otherwise two
  // live rows could represent the same org pair with conflicting status,
  // which would make GET /internal/connections/status ambiguous for
  // ticket-service/pr-service's sharing checks in Phase 3/4.
  const existingActive = await prisma.orgConnection.findFirst({
    where: {
      status: { in: ['PENDING', 'APPROVED'] },
      OR: [
        { requesterOrgId: orgId, targetOrgId },
        { requesterOrgId: targetOrgId, targetOrgId: orgId },
      ],
    },
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
 * org (revoke)" — PLUS PSA for both actions, per api_reference.md's table
 * (see the note on assertOrgAdminOrPSA above for why this differs from the
 * original Phase 2 reading). PSA acts on connections between two orgs it
 * doesn't belong to at all, so it can't be expressed as "is the target/
 * either org's admin" — it's a separate, explicit bypass of that whole
 * membership question, same shape as org.service.js's `GET /orgs/:id`.
 */
async function respondToConnection(connectionId, caller, { status }) {
  const connection = await prisma.orgConnection.findUnique({ where: { id: connectionId } });
  if (!connection) throw CONNECTION_NOT_FOUND();

  const isPSA = caller.isPlatformAdmin;
  const isRequesterOrgAdmin =
    caller.activeOrgId === connection.requesterOrgId && caller.orgRole === 'ORG_ADMIN';
  const isTargetOrgAdmin =
    caller.activeOrgId === connection.targetOrgId && caller.orgRole === 'ORG_ADMIN';

  if (!isPSA && !isRequesterOrgAdmin && !isTargetOrgAdmin) {
    // Caller has no relationship to this connection at all — 404, not 403.
    throw CONNECTION_NOT_FOUND();
  }

  if (status === 'APPROVED') {
    if (!isPSA && !isTargetOrgAdmin) {
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
