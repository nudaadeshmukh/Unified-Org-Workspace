const express = require('express');
const { z } = require('zod');
const { authenticate } = require('@froncort/shared');
const connectionService = require('../services/connection.service');

const router = express.Router();

const respondSchema = z.object({
  status: z.enum(['APPROVED', 'REVOKED']),
});

// No requireRole gate: api_reference.md excludes PSA from this route, and
// "target org admin to approve / either org admin to revoke" depends on
// which connection and which action — handled inside the service.
router.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const body = respondSchema.parse(req.body);
    const connection = await connectionService.respondToConnection(req.params.id, req.user, body);
    res.json({ data: connection });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
