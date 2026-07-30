const prisma = require('../lib/prisma');

/**
 * GET /internal/facts/prs?userId=&orgId= — pre-aggregated facts for
 * audit-service's AI digest job. Same "facts only, scoped before it leaves
 * this service" constraint as ticket-service's facts.service.js.
 *
 * "Awaiting this user's review" = PR is IN_REVIEW, this user is an assigned
 * reviewer (PRReviewer row exists), AND this user hasn't yet submitted any
 * review on it — once they've reviewed, the ball is in the author's/other
 * reviewers' court, not theirs anymore, so it's not still "awaiting" their
 * review specifically. This is a judgment call about what "awaiting" means
 * given the actual review workflow (api_reference.md doesn't define it more
 * precisely) — flagged in docs/project-progress.md.
 *
 * "Oldest idle time" = hours since the oldest such PR's `updatedAt` — the
 * closest available proxy for "how long has this needed attention," since
 * there's no separate "entered IN_REVIEW at" timestamp. `oldestIdleHours`
 * is `null`, not `0`, when nothing is awaiting review — a real "no work
 * outstanding" result, distinguishable from a failed facts call by the
 * caller (packages/shared/prClient.js returns `null` for the whole result
 * on failure, not just this field).
 */
async function getPRFacts(userId, orgId) {
  const reviewerRows = await prisma.pRReviewer.findMany({ where: { userId } });
  const prIds = reviewerRows.map((r) => r.prId);

  if (!prIds.length) {
    return { awaitingReviewCount: 0, oldestIdleHours: null };
  }

  const candidates = await prisma.pullRequest.findMany({
    where: { id: { in: prIds }, orgId, status: 'IN_REVIEW' },
  });

  const awaiting = [];
  for (const pr of candidates) {
    const existingReview = await prisma.pRReview.findFirst({
      where: { prId: pr.id, reviewerId: userId },
    });
    if (!existingReview) {
      awaiting.push(pr);
    }
  }

  if (!awaiting.length) {
    return { awaitingReviewCount: 0, oldestIdleHours: null };
  }

  const oldestUpdatedAt = awaiting.reduce(
    (oldest, pr) => (pr.updatedAt < oldest ? pr.updatedAt : oldest),
    awaiting[0].updatedAt
  );
  const oldestIdleHours = Math.round((Date.now() - oldestUpdatedAt.getTime()) / (60 * 60 * 1000));

  return { awaitingReviewCount: awaiting.length, oldestIdleHours };
}

module.exports = { getPRFacts };
