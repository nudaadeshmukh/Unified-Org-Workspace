const express = require('express');
const { z } = require('zod');
const { authenticate, requireRole } = require('@froncort/shared');
const connectionService = require('../services/connection.service');

const router = express.Router();

const respondSchema = z.object({
  status: z.enum(['APPROVED', 'REVOKED']),
});

// requireRole(['ORG_ADMIN'], { allowPlatformAdmin: false }): both approve and
// revoke require caller.orgRole === 'ORG_ADMIN' regardless of which action,
// so this is a valid blanket gate — but api_reference.md excludes PSA from
// this route, so allowPlatformAdmin: false (CLAUDE.md's "Platform Super
// Admin scope"). WHICH org (target-to-approve vs either-to-revoke) still
// depends on the specific connection and action — handled inside the
// service, which is why this doesn't fully replace that check.
router.patch(
  '/:id',
  authenticate,
  requireRole(['ORG_ADMIN'], { allowPlatformAdmin: false }),
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
