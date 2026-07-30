const express = require('express');
const { internalAuth } = require('@froncort/shared');
const factsService = require('../services/facts.service');

const router = express.Router();

// Added in Phase 5 — see api_reference.md's pr-service internal table. Used
// by audit-service's AI digest job.
router.get('/facts/prs', internalAuth, async (req, res, next) => {
  try {
    const { userId, orgId } = req.query;
    if (!userId || !orgId) {
      return res.status(400).json({
        error: { message: 'userId and orgId query params are required', code: 'VALIDATION_ERROR' },
      });
    }
    const result = await factsService.getPRFacts(String(userId), String(orgId));
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
