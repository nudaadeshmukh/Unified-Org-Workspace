// RS256 access-token sign/verify. Keys come from JWT_PRIVATE_KEY / JWT_PUBLIC_KEY
// env vars (base64-encoded PEM) — see CLAUDE.md rule #6.

const jwt = require('jsonwebtoken');

function decodeKey(envVar) {
  const raw = process.env[envVar];
  if (!raw) {
    throw new Error(`${envVar} is not set — check .env / Railway env vars`);
  }
  return Buffer.from(raw, 'base64').toString('utf8');
}

/**
 * Signs an access token. identity-service only.
 * @param {{id: string, activeOrgId: string|null, orgRole: string|null, isPlatformAdmin: boolean}} payload
 * @returns {string}
 */
function sign(payload) {
  const privateKey = decodeKey('JWT_PRIVATE_KEY');
  const ttlSeconds = parseInt(process.env.ACCESS_TOKEN_TTL_SECONDS || '900', 10);
  return jwt.sign(
    {
      id: payload.id,
      activeOrgId: payload.activeOrgId,
      orgRole: payload.orgRole,
      isPlatformAdmin: payload.isPlatformAdmin,
    },
    privateKey,
    { algorithm: 'RS256', expiresIn: ttlSeconds }
  );
}

/**
 * Verifies an access token. All services use this; never call identity-service
 * synchronously to check a token.
 * @param {string} token
 * @returns {{id: string, activeOrgId: string|null, orgRole: string|null, isPlatformAdmin: boolean}}
 */
function verify(token) {
  const publicKey = decodeKey('JWT_PUBLIC_KEY');
  const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
  return {
    id: decoded.id,
    activeOrgId: decoded.activeOrgId,
    orgRole: decoded.orgRole,
    isPlatformAdmin: decoded.isPlatformAdmin,
  };
}

module.exports = { sign, verify };
