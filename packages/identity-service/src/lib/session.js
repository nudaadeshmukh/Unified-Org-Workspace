// Refresh-token session state in Redis. Opaque token, httpOnly/Secure cookie
// on the wire (set by auth.routes.js) — this module only knows the token
// string, never a JWT. Rotated on every /auth/refresh call; reuse of an
// already-rotated token wipes the whole session (CLAUDE.md rule #5,
// implementation_guide.md Phase 2).
//
// Key shapes:
//   refresh:<token>  -> JSON { userId, activeOrgId, orgRole }              (live)
//                     -> JSON { userId, revoked: true }                     (tombstone, short TTL)
//   session:<userId> -> Set of live token strings, for logout-everywhere.
//
// A tombstone (rather than an outright delete) is what makes reuse detection
// possible: a *live* rotated-away token still needs to name its owner so a
// second use of it can trigger a full session wipe, not just a generic 401.

const { randomBytes } = require('crypto');
const { redisClient } = require('./redis');

const REFRESH_TTL_SECONDS = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10) * 24 * 60 * 60;
const TOMBSTONE_TTL_SECONDS = 60;

function refreshKey(token) {
  return `refresh:${token}`;
}

function sessionKey(userId) {
  return `session:${userId}`;
}

function generateToken() {
  return randomBytes(48).toString('hex');
}

/**
 * @param {string} userId
 * @param {string|null} activeOrgId
 * @param {string|null} orgRole
 * @returns {Promise<string>} the new refresh token
 */
async function createSession(userId, activeOrgId, orgRole) {
  const token = generateToken();
  const value = JSON.stringify({ userId, activeOrgId, orgRole });
  await redisClient.set(refreshKey(token), value, { EX: REFRESH_TTL_SECONDS });
  await redisClient.sAdd(sessionKey(userId), token);
  await redisClient.expire(sessionKey(userId), REFRESH_TTL_SECONDS);
  return token;
}

/**
 * Updates the org context stored against a live refresh token (used by
 * switch-org, so a later refresh keeps issuing access tokens for the org
 * the user last switched into) without rotating the token string itself.
 */
async function updateSessionContext(token, activeOrgId, orgRole) {
  const raw = await redisClient.get(refreshKey(token));
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (parsed.revoked) return null;
  const ttl = await redisClient.ttl(refreshKey(token));
  const value = JSON.stringify({ userId: parsed.userId, activeOrgId, orgRole });
  await redisClient.set(refreshKey(token), value, { EX: ttl > 0 ? ttl : REFRESH_TTL_SECONDS });
  return { userId: parsed.userId, activeOrgId, orgRole };
}

/**
 * Rotates a refresh token. Three outcomes:
 *  - 'ok': token was live; old token tombstoned, new one issued.
 *  - 'reuse_detected': token was already a tombstone (rotated once before) —
 *     the whole session for that user is wiped.
 *  - 'invalid': token doesn't exist at all (garbage/expired/never issued).
 */
async function rotateSession(oldToken) {
  const raw = await redisClient.get(refreshKey(oldToken));
  if (!raw) {
    return { status: 'invalid' };
  }

  const parsed = JSON.parse(raw);

  if (parsed.revoked) {
    await wipeAllSessions(parsed.userId);
    return { status: 'reuse_detected', userId: parsed.userId };
  }

  const ttl = await redisClient.ttl(refreshKey(oldToken));
  await redisClient.set(
    refreshKey(oldToken),
    JSON.stringify({ userId: parsed.userId, revoked: true }),
    { EX: ttl > 0 ? Math.min(ttl, TOMBSTONE_TTL_SECONDS) : TOMBSTONE_TTL_SECONDS }
  );
  await redisClient.sRem(sessionKey(parsed.userId), oldToken);

  const newToken = await createSession(parsed.userId, parsed.activeOrgId, parsed.orgRole);

  return {
    status: 'ok',
    token: newToken,
    userId: parsed.userId,
    activeOrgId: parsed.activeOrgId,
    orgRole: parsed.orgRole,
  };
}

/**
 * "Logout everywhere" — deletes every live refresh token for a user plus
 * the session set itself. Tombstones expire on their own short TTL.
 */
async function wipeAllSessions(userId) {
  const tokens = await redisClient.sMembers(sessionKey(userId));
  if (tokens.length) {
    await redisClient.del(tokens.map(refreshKey));
  }
  await redisClient.del(sessionKey(userId));
}

module.exports = {
  createSession,
  updateSessionContext,
  rotateSession,
  wipeAllSessions,
  REFRESH_TTL_SECONDS,
};
