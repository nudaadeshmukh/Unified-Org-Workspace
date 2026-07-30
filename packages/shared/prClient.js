// Internal service-to-service client for pr-service. Added in Phase 5,
// same purpose and same fail-closed shape as ticketClient.js.

/**
 * @param {string} userId
 * @param {string} orgId
 * @returns {Promise<{awaitingReviewCount: number, oldestIdleHours: number|null}|null>}
 * `null` (never throws) on any failure — distinct from a legitimate
 * `{awaitingReviewCount: 0, oldestIdleHours: null}` (nothing awaiting review
 * is a real, valid result; a failed call is not).
 */
async function getPRFacts(userId, orgId) {
  const baseUrl = process.env.PR_SERVICE_URL;
  const apiKey = process.env.INTERNAL_API_KEY;

  const url = `${baseUrl}/internal/facts/prs?userId=${encodeURIComponent(userId)}&orgId=${encodeURIComponent(orgId)}`;

  try {
    const res = await fetch(url, { headers: { 'X-Internal-Api-Key': apiKey } });
    if (!res.ok) {
      console.error(`prClient: facts fetch returned HTTP ${res.status}`);
      return null;
    }
    const body = await res.json();
    if (!body.data) return null;
    return { awaitingReviewCount: body.data.awaitingReviewCount, oldestIdleHours: body.data.oldestIdleHours };
  } catch (err) {
    console.error('prClient: facts fetch failed:', err.message);
    return null;
  }
}

module.exports = { getPRFacts };
