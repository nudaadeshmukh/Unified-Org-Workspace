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

module.exports = { getOrg, addMember, updateMemberRole, removeMember };
