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

module.exports = { checkConnectionApproved };
