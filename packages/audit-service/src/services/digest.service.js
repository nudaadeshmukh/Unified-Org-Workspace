const { identityClient, ticketClient, prClient } = require('@froncort/shared');
const groqClient = require('../lib/groqClient');
const notificationService = require('./notification.service');

/**
 * Builds the AI digest prompt from ONLY the two pre-scoped facts objects —
 * no orgId, no userId, no raw ticket/PR rows, nothing beyond the numbers
 * ticket-service's and pr-service's own internal facts endpoints already
 * scoped to this exact user before this function ever saw them. This is
 * the critical boundary implementation_guide.md's Phase 5 section and
 * Phase 6's ai-leakage.test.js both care about: the scoping has to happen
 * before this point, not be enforced (or trusted) here — this function
 * can't leak what it never received. Exported as a pure, standalone
 * function specifically so that test can call it directly and assert on
 * the exact string, rather than reverse-engineering it from a mocked Groq
 * call's arguments.
 * @param {{assignedCount: number, overdueCount: number}} ticketFacts
 * @param {{awaitingReviewCount: number, oldestIdleHours: number|null}} prFacts
 * @returns {string}
 */
function buildDigestPrompt({ ticketFacts, prFacts }) {
  const lines = [
    'You are an internal productivity assistant. Write a short (1-2 sentence), ' +
      'friendly status update for this one user, using ONLY the facts listed below. ' +
      'Do not invent, assume, or reference any information beyond these facts.',
    '',
    `Tickets assigned to you needing action: ${ticketFacts.assignedCount}`,
    `Of those, overdue: ${ticketFacts.overdueCount}`,
    `Pull requests awaiting your review: ${prFacts.awaitingReviewCount}`,
    prFacts.oldestIdleHours === null
      ? 'No pull requests are currently awaiting your review.'
      : `The oldest pull request awaiting your review has been idle for ${prFacts.oldestIdleHours} hours.`,
  ];
  return lines.join('\n');
}

/**
 * Generates and stores one digest for one (userId, orgId) membership row.
 * Every fact call and the Groq call itself can fail independently and
 * non-fatally — this is a background job, not a request/response cycle, so
 * a failure for one user must never block the rest of the cycle. Returns
 * the created Notification, or `null` if this user's digest was skipped.
 */
async function generateDigestForMembership({ userId, orgId }) {
  const [ticketFacts, prFacts] = await Promise.all([
    ticketClient.getTicketFacts(userId, orgId),
    prClient.getPRFacts(userId, orgId),
  ]);

  if (!ticketFacts || !prFacts) {
    console.warn(`[audit-service] skipping digest for user ${userId} in org ${orgId} — facts fetch failed`);
    return null;
  }

  const prompt = buildDigestPrompt({ ticketFacts, prFacts });

  let digestText;
  try {
    digestText = await groqClient.generateDigest(prompt);
  } catch (err) {
    console.warn(`[audit-service] skipping digest for user ${userId} in org ${orgId} — Groq call failed: ${err.message}`);
    return null;
  }

  return notificationService.createDigestNotification({ userId, orgId, body: digestText });
}

/**
 * One full digest cycle: enumerate every (userId, orgId) membership via
 * identity-service, generate one independent digest per row. A user
 * belonging to 2 orgs gets 2 separate digest computations and 2 separate
 * Notification rows — never one combined cross-org digest in a single
 * prompt (per the user's explicit instruction — keeps the leakage boundary
 * unambiguous for Phase 6's test).
 */
async function runDigestCycle() {
  const memberships = await identityClient.getOrgMembers();
  if (!memberships) {
    console.warn('[audit-service] digest cycle skipped — could not fetch org memberships');
    return;
  }

  console.log(`[audit-service] running AI digest cycle for ${memberships.length} membership(s)`);

  for (const { userId, orgId } of memberships) {
    try {
      await generateDigestForMembership({ userId, orgId });
    } catch (err) {
      console.warn(`[audit-service] digest generation failed for user ${userId} org ${orgId}:`, err.message);
    }
  }
}

module.exports = { buildDigestPrompt, generateDigestForMembership, runDigestCycle };
