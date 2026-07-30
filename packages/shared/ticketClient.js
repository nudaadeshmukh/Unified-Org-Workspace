// Internal service-to-service client for ticket-service. Added in Phase 5
// so audit-service's AI digest job can pull pre-aggregated, per-user facts
// without ever seeing a raw query result — the scoping happens entirely on
// ticket-service's side (see ticket-service's facts.service.js), this client
// just carries the already-scoped numbers across the wire.

/**
 * @param {string} userId
 * @param {string} orgId
 * @returns {Promise<{assignedCount: number, overdueCount: number}|null>}
 * `null` (never throws) on any failure — distinct from a legitimate
 * `{assignedCount: 0, overdueCount: 0}`, so the digest job can skip
 * generating a digest for this user this cycle rather than report a false
 * "0 tickets" that isn't actually known to be true.
 */
async function getTicketFacts(userId, orgId) {
  const baseUrl = process.env.TICKET_SERVICE_URL;
  const apiKey = process.env.INTERNAL_API_KEY;

  const url = `${baseUrl}/internal/facts/tickets?userId=${encodeURIComponent(userId)}&orgId=${encodeURIComponent(orgId)}`;

  try {
    const res = await fetch(url, { headers: { 'X-Internal-Api-Key': apiKey } });
    if (!res.ok) {
      console.error(`ticketClient: facts fetch returned HTTP ${res.status}`);
      return null;
    }
    const body = await res.json();
    if (!body.data) return null;
    return { assignedCount: body.data.assignedCount, overdueCount: body.data.overdueCount };
  } catch (err) {
    console.error('ticketClient: facts fetch failed:', err.message);
    return null;
  }
}

module.exports = { getTicketFacts };
