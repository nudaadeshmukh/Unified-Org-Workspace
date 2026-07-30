const cron = require('node-cron');
const { runDigestCycle } = require('./services/digest.service');

/**
 * node-cron scheduler for the AI digest job, per implementation_guide.md's
 * Phase 5 scope — "delivered on a schedule via a background job at
 * regular, configurable intervals," not computed on page load. Interval is
 * env-driven (AI_DIGEST_INTERVAL_HOURS), converted to an hourly cron
 * expression. No public endpoint triggers this — see api_reference.md's
 * "AI Digest" section.
 */
function startDigestScheduler() {
  const hours = Number(process.env.AI_DIGEST_INTERVAL_HOURS) || 6;
  const expression = `0 */${hours} * * *`;

  cron.schedule(expression, () => {
    runDigestCycle().catch((err) => console.error('[audit-service] digest cycle crashed:', err));
  });

  console.log(`[audit-service] AI digest scheduled every ${hours}h (cron: "${expression}")`);
}

module.exports = { startDigestScheduler };
