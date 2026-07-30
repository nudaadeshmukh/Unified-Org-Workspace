const express = require('express');
const { internalAuth } = require('@froncort/shared');
const connectionService = require('../services/connection.service');
const orgService = require('../services/org.service');

const router = express.Router();

router.get('/connections/status', internalAuth, async (req, res, next) => {
  try {
    const { orgA, orgB } = req.query;
    if (!orgA || !orgB) {
      return res.status(400).json({
        error: { message: 'orgA and orgB query params are required', code: 'VALIDATION_ERROR' },
      });
    }
    const result = await connectionService.checkStatusBetween(String(orgA), String(orgB));
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// Added in Phase 4 — see api_reference.md's internal-endpoints table. Used by
// pr-service to verify a userId is actually a REVIEWER in the target org
// before creating a PRReviewer row.
router.get('/users/:userId/org-role', internalAuth, async (req, res, next) => {
  try {
    const { orgId } = req.query;
    if (!orgId) {
      return res.status(400).json({
        error: { message: 'orgId query param is required', code: 'VALIDATION_ERROR' },
      });
    }
    const result = await orgService.getUserOrgRole(req.params.userId, String(orgId));
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// Added in Phase 5 — see api_reference.md's internal-endpoints table. Used
// by audit-service's AI digest job to enumerate which (userId, orgId, role)
// pairs to generate a digest for. orgId is optional.
router.get('/org-members', internalAuth, async (req, res, next) => {
  try {
    const { orgId } = req.query;
    const result = await orgService.getOrgMembers(orgId ? String(orgId) : undefined);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
