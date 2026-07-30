const express = require('express');
const { z } = require('zod');
const { authenticate, requireRole } = require('@froncort/shared');
const connectionService = require('../services/connection.service');

const router = express.Router();

const respondSchema = z.object({
  status: z.enum(['APPROVED', 'REVOKED']),
});

// requireRole(['ORG_ADMIN'], { allowPlatformAdmin: true }): non-PSA callers
// still need caller.orgRole === 'ORG_ADMIN' regardless of which action; PSA
// bypasses this router-level gate entirely (their orgRole is typically null,
// since PSAs have no OrgMembership). api_reference.md's table lists PSA
// here — matches its documented scope over cross-org connections. WHICH org
// (target-to-approve vs either-to-revoke, or PSA acting on neither)
// still depends on the specific connection and action — handled inside
// connectionService.respondToConnection's own explicit PSA bypass, which is
// why this router gate doesn't fully replace that check.
router.patch(
  '/:id',
  authenticate,
  requireRole(['ORG_ADMIN'], { allowPlatformAdmin: true }),
  async (req, res, next) => {
    try {
      const body = respondSchema.parse(req.body);
      const connection = await connectionService.respondToConnection(req.params.id, req.user, body);
      res.json({ data: connection });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
