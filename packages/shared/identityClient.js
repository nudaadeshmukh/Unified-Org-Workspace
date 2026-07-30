// Internal service-to-service client for identity-service. Uses the shared
// internal API key header (CLAUDE.md rule #7), never the end-user's JWT
// forwarded onward. Built in Phase 3 for ticket-service's cross-org sharing
// checks; reused as-is by pr-service in Phase 4 (implementation_guide.md
// Phase 4 explicitly calls out reusing this rather than rewriting it).

/**
 * Asks identity-service whether an APPROVED connection currently exists
 * between two orgs, in either direction. Returns false (never throws) on
 * any failure — a down/unreachable identity-service must never be treated
 * as "connection approved"; callers should read `false` as "cannot confirm
 * a connection, so deny the cross-org action."
 * @param {string} orgA
 * @param {string} orgB
 * @returns {Promise<boolean>}
 */
async function checkConnectionApproved(orgA, orgB) {
  const baseUrl = process.env.IDENTITY_SERVICE_URL;
  const apiKey = process.env.INTERNAL_API_KEY;

  const url = `${baseUrl}/internal/connections/status?orgA=${encodeURIComponent(orgA)}&orgB=${encodeURIComponent(orgB)}`;

  try {
    const res = await fetch(url, { headers: { 'X-Internal-Api-Key': apiKey } });
    if (!res.ok) {
      console.error(`identityClient: connection-status check returned HTTP ${res.status}`);
      return false;
    }
    const body = await res.json();
    return Boolean(body.data && body.data.approved);
  } catch (err) {
    console.error('identityClient: connection-status check failed:', err.message);
    return false;
  }
}

/**
 * Asks identity-service what role (if any) a userId holds in a given org.
 * Added in Phase 4 so pr-service can verify a reviewer-assignment target is
 * actually a REVIEWER in that org before trusting it, instead of trusting an
 * unverified role claim from the request body. Same fail-closed contract as
 * checkConnectionApproved: any failure (including identity-service being
 * unreachable) returns `{ role: null, isPlatformAdmin: false }` — "cannot
 * verify" must never be treated as "verified."
 * @param {string} userId
 * @param {string} orgId
 * @returns {Promise<{role: string|null, isPlatformAdmin: boolean}>}
 */
async function getUserOrgRole(userId, orgId) {
  const baseUrl = process.env.IDENTITY_SERVICE_URL;
  const apiKey = process.env.INTERNAL_API_KEY;

  const url = `${baseUrl}/internal/users/${encodeURIComponent(userId)}/org-role?orgId=${encodeURIComponent(orgId)}`;

  try {
    const res = await fetch(url, { headers: { 'X-Internal-Api-Key': apiKey } });
    if (!res.ok) {
      console.error(`identityClient: org-role check returned HTTP ${res.status}`);
      return { role: null, isPlatformAdmin: false };
    }
    const body = await res.json();
    return {
      role: (body.data && body.data.role) || null,
      isPlatformAdmin: Boolean(body.data && body.data.isPlatformAdmin),
    };
  } catch (err) {
    console.error('identityClient: org-role check failed:', err.message);
    return { role: null, isPlatformAdmin: false };
  }
}

/**
 * Asks identity-service for org membership rows — used by audit-service's
 * AI digest job to enumerate who to generate a digest for. `orgId` is
 * optional (omit for every membership across every org). Returns `null`
 * (never throws, never an empty array) on any failure — distinct from a
 * legitimately empty result, so callers can tell "identity-service is down,
 * skip this digest cycle" apart from "there really are zero members."
 * @param {string} [orgId]
 * @returns {Promise<{userId: string, orgId: string, role: string}[]|null>}
 */
async function getOrgMembers(orgId) {
  const baseUrl = process.env.IDENTITY_SERVICE_URL;
  const apiKey = process.env.INTERNAL_API_KEY;

  const url = `${baseUrl}/internal/org-members${orgId ? `?orgId=${encodeURIComponent(orgId)}` : ''}`;

  try {
    const res = await fetch(url, { headers: { 'X-Internal-Api-Key': apiKey } });
    if (!res.ok) {
      console.error(`identityClient: org-members fetch returned HTTP ${res.status}`);
      return null;
    }
    const body = await res.json();
    return Array.isArray(body.data) ? body.data : null;
  } catch (err) {
    console.error('identityClient: org-members fetch failed:', err.message);
    return null;
  }
}

module.exports = { checkConnectionApproved, getUserOrgRole, getOrgMembers };
