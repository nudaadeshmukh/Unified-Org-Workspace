const bcrypt = require('bcrypt');
const { jwt } = require('@froncort/shared');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const session = require('../lib/session');

const BCRYPT_COST = 12;

function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isPlatformAdmin: user.isPlatformAdmin,
  };
}

function serializeMemberships(memberships) {
  return memberships.map((m) => ({ orgId: m.orgId, orgName: m.org.name, role: m.role }));
}

/**
 * @param {{email: string, password: string, name: string, orgName: string}} input
 */
async function register({ email, password, name, orgName }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError('An account with this email already exists', 409, 'EMAIL_TAKEN');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  const { user, org } = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: orgName } });
    const user = await tx.user.create({ data: { email, passwordHash, name } });
    await tx.orgMembership.create({ data: { userId: user.id, orgId: org.id, role: 'ORG_ADMIN' } });
    return { user, org };
  });

  const accessToken = jwt.sign({
    id: user.id,
    activeOrgId: org.id,
    orgRole: 'ORG_ADMIN',
    isPlatformAdmin: false,
  });
  const refreshToken = await session.createSession(user.id, org.id, 'ORG_ADMIN');

  return {
    accessToken,
    refreshToken,
    user: serializeUser(user),
    memberships: [{ orgId: org.id, orgName: org.name, role: 'ORG_ADMIN' }],
  };
}

/**
 * @param {{email: string, password: string}} input
 */
async function login({ email, password }) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { include: { org: true }, orderBy: { createdAt: 'asc' } } },
  });

  // Same generic message/code whether the email doesn't exist or the
  // password is wrong — never reveal which one it was.
  if (!user) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }
  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const primary = user.memberships[0] || null;
  const activeOrgId = primary ? primary.orgId : null;
  const orgRole = primary ? primary.role : null;

  const accessToken = jwt.sign({
    id: user.id,
    activeOrgId,
    orgRole,
    isPlatformAdmin: user.isPlatformAdmin,
  });
  const refreshToken = await session.createSession(user.id, activeOrgId, orgRole);

  return {
    accessToken,
    refreshToken,
    user: serializeUser(user),
    memberships: serializeMemberships(user.memberships),
  };
}

/**
 * @param {string|undefined} oldToken
 */
async function refresh(oldToken) {
  if (!oldToken) {
    throw new AppError('No refresh token provided', 401, 'UNAUTHENTICATED');
  }

  const result = await session.rotateSession(oldToken);

  if (result.status === 'reuse_detected') {
    throw new AppError('Session invalidated — please log in again', 401, 'SESSION_REVOKED');
  }
  if (result.status === 'invalid') {
    throw new AppError('Invalid or expired refresh token', 401, 'UNAUTHENTICATED');
  }

  const user = await prisma.user.findUnique({ where: { id: result.userId } });
  if (!user) {
    throw new AppError('Invalid or expired refresh token', 401, 'UNAUTHENTICATED');
  }

  const accessToken = jwt.sign({
    id: user.id,
    activeOrgId: result.activeOrgId,
    orgRole: result.orgRole,
    isPlatformAdmin: user.isPlatformAdmin,
  });

  return { accessToken, refreshToken: result.token };
}

/**
 * @param {string} userId
 * @param {string|undefined} refreshToken
 * @param {string} orgId
 */
async function switchOrg(userId, refreshToken, orgId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const membership = await prisma.orgMembership.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
  if (!membership && !user.isPlatformAdmin) {
    throw new AppError('You are not a member of this organization', 404, 'NOT_FOUND');
  }

  const activeOrgId = orgId;
  const orgRole = membership ? membership.role : null;

  const accessToken = jwt.sign({
    id: user.id,
    activeOrgId,
    orgRole,
    isPlatformAdmin: user.isPlatformAdmin,
  });

  if (refreshToken) {
    await session.updateSessionContext(refreshToken, activeOrgId, orgRole);
  }

  return { accessToken };
}

/**
 * @param {string} userId
 */
async function logoutEverywhere(userId) {
  await session.wipeAllSessions(userId);
}

/**
 * @param {string} userId
 */
async function getMe(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberships: { include: { org: true }, orderBy: { createdAt: 'asc' } } },
  });
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }
  return { user: serializeUser(user), memberships: serializeMemberships(user.memberships) };
}

module.exports = { register, login, refresh, switchOrg, logoutEverywhere, getMe };
