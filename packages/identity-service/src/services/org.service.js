const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');

const NOT_FOUND = () => new AppError('Organization not found', 404, 'NOT_FOUND');

// GET /orgs/:id is "ANY (own org) or PSA" — any role, not just OA.
function assertOrgMember(caller, orgId) {
  if (caller.isPlatformAdmin) return;
  if (caller.activeOrgId !== orgId) throw NOT_FOUND();
}

// Member-management routes are "OA (own org) or PSA".
function assertOrgAdminOrPSA(caller, orgId) {
  if (caller.isPlatformAdmin) return;
  if (caller.activeOrgId !== orgId || caller.orgRole !== 'ORG_ADMIN') throw NOT_FOUND();
}

async function getOrg(orgId, caller) {
  assertOrgMember(caller, orgId);
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw NOT_FOUND();
  return org;
}

/**
 * GET /orgs/:id/members — "OA (own org) or PSA", same gate as the other
 * member-management routes. Added after Phase 7 specifically so the
 * frontend can resolve userId -> name for same-org users (comments,
 * attachments, ticket assignment) instead of showing raw UUIDs, and build a
 * real assignee/reviewer picker instead of a free-text UUID field. Returns
 * `{userId, email, name, role}` per member — deliberately not the full User
 * row (no passwordHash, no isPlatformAdmin), since this is member-facing
 * data exposed to any OA of the org, not an admin-only internal endpoint.
 */
async function listMembers(orgId, caller) {
  assertOrgAdminOrPSA(caller, orgId);

  const memberships = await prisma.orgMembership.findMany({
    where: { orgId },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return memberships.map((m) => ({
    userId: m.user.id,
    email: m.user.email,
    name: m.user.name,
    role: m.role,
  }));
}

/**
 * Adds an existing user to an org. There is no invite/email flow in this
 * build (out of Phase 2 scope) — the target email must already belong to a
 * registered User, otherwise this 404s. See docs/project-progress.md Phase 2
 * entry for the reasoning.
 */
async function addMember(orgId, caller, { email, role }) {
  assertOrgAdminOrPSA(caller, orgId);

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw NOT_FOUND();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError(
      'No user found with this email — they must register an account first',
      404,
      'USER_NOT_FOUND'
    );
  }

  const existing = await prisma.orgMembership.findUnique({
    where: { userId_orgId: { userId: user.id, orgId } },
  });
  if (existing) {
    throw new AppError('User is already a member of this organization', 409, 'ALREADY_MEMBER');
  }

  return prisma.orgMembership.create({ data: { userId: user.id, orgId, role } });
}

async function updateMemberRole(orgId, targetUserId, caller, { role }) {
  assertOrgAdminOrPSA(caller, orgId);

  const membership = await prisma.orgMembership.findUnique({
    where: { userId_orgId: { userId: targetUserId, orgId } },
  });
  if (!membership) throw new AppError('Membership not found', 404, 'NOT_FOUND');

  return prisma.orgMembership.update({ where: { id: membership.id }, data: { role } });
}

async function removeMember(orgId, targetUserId, caller) {
  assertOrgAdminOrPSA(caller, orgId);

  const membership = await prisma.orgMembership.findUnique({
    where: { userId_orgId: { userId: targetUserId, orgId } },
  });
  if (!membership) throw new AppError('Membership not found', 404, 'NOT_FOUND');

  await prisma.orgMembership.delete({ where: { id: membership.id } });
}

/**
 * GET /internal/users/:userId/org-role?orgId= — added in Phase 4 so
 * pr-service (and, retrofitted, ticket-service) can verify a userId's actual
 * role in an org before trusting it (e.g. "must be a REVIEWER in that org"
 * on reviewer assignment, "must be a real org member" on ticket assignment)
 * instead of trusting an unverified role claim from the request body. Always
 * a 200 — `role: null` means "not a member of that org" (or the user doesn't
 * exist at all), not a 404; the calling service decides what that means for
 * its own use case. No caller-identity check here beyond the internal API
 * key (see internalAuth middleware) since this is service-to-service only.
 */
async function getUserOrgRole(userId, orgId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { role: null, isPlatformAdmin: false };
  }

  const membership = await prisma.orgMembership.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });

  return { role: membership ? membership.role : null, isPlatformAdmin: user.isPlatformAdmin };
}

/**
 * GET /internal/org-members?orgId= — added in Phase 5 so audit-service's AI
 * digest job can enumerate who to generate a digest for. `orgId` is
 * optional: with it, returns just that org's memberships; without it,
 * returns every membership across every org. Deliberately returns raw
 * membership rows (userId, orgId, role), not full User objects — the digest
 * job treats each row as one independent unit of digest generation (a user
 * in 2 orgs gets 2 separate digests, never a combined one), so it never
 * needs anything beyond this shape. No caller-identity check beyond the
 * internal API key, same as the other /internal/* routes.
 */
async function getOrgMembers(orgId) {
  return prisma.orgMembership.findMany({
    where: orgId ? { orgId } : undefined,
    select: { userId: true, orgId: true, role: true },
    orderBy: { createdAt: 'asc' },
  });
}

module.exports = { getOrg, listMembers, addMember, updateMemberRole, removeMember, getUserOrgRole, getOrgMembers };
