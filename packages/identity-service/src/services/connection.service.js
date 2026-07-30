const crypto = require('crypto');
const { auditClient } = require('@froncort/shared');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');

const NOT_FOUND = () => new AppError('Organization not found', 404, 'NOT_FOUND');
const CONNECTION_NOT_FOUND = () => new AppError('Connection not found', 404, 'NOT_FOUND');

// CLAUDE.md rule #9 is now locked (resolved, not a stopgap): audit calls
// block, and happen BEFORE the corresponding database write, not after — no
// mutation may succeed without a matching audit entry. This is a thin
// pass-through now (the swallow-and-warn Phase 2-4 behavior is retired); it
// exists purely so call sites read `logAudit(...)` instead of reaching into
// `auditClient` directly. Letting the throw propagate IS the abort — callers
// must call this before their prisma write, not wrap it in try/catch.
async function logAudit(event) {
  return auditClient.log(event);
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

  // ID generated client-side, before either write, so the audit call can
  // reference the connection's real ID without needing the DB row to exist
  // yet — this is what makes audit-before-mutation possible (CLAUDE.md rule
  // #9). If logAudit throws, the create below never runs.
  const connectionId = crypto.randomUUID();

  await logAudit({
    orgId,
    actorId: caller.id,
    action: 'CONNECTION_REQUESTED',
    entityType: 'OrgConnection',
    entityId: connectionId,
    metadata: { requesterOrgId: orgId, targetOrgId },
  });

  return prisma.orgConnection.create({
    data: { id: connectionId, requesterOrgId: orgId, targetOrgId, status: 'PENDING' },
  });
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

  // orgId should reflect the caller's own org whenever they have one — a
  // real OA acting on this connection (either the requester's or the
  // target's admin) wants the entry to show up under THEIR org's audit log,
  // not always the requester's. Using connection.requesterOrgId
  // unconditionally (the first pass at this fix) was wrong: it misattributed
  // every target-org approval/revoke to the requesting org instead, so it'd
  // never show under the approving org's own audit filter. Fall back to
  // connection.requesterOrgId only for PSA specifically, whose
  // caller.activeOrgId is genuinely null (no OrgMembership exists for PSAs
  // by design) — there is no "caller's own org" to attribute it to.
  await logAudit({
    orgId: caller.activeOrgId || connection.requesterOrgId,
    actorId: caller.id,
    action: status === 'APPROVED' ? 'CONNECTION_APPROVED' : 'CONNECTION_REVOKED',
    entityType: 'OrgConnection',
    entityId: connection.id,
    metadata: { requesterOrgId: connection.requesterOrgId, targetOrgId: connection.targetOrgId, status },
  });

  return prisma.orgConnection.update({ where: { id: connectionId }, data: { status } });
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
