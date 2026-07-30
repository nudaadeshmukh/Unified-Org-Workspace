const express = require('express');
const { authenticate } = require('@froncort/shared');
const featureFlagService = require('../services/featureFlag.service');

const router = express.Router();

// "ANY (own org)" — no PSA per api_reference.md, no role gate beyond own-org
// membership, which featureFlagService checks via orgScope.ownsResource.
router.get('/:orgId/feature-flags', authenticate, async (req, res, next) => {
  try {
    const flags = await featureFlagService.listFeatureFlags(req.params.orgId, req.user);
    res.json({ data: flags });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
