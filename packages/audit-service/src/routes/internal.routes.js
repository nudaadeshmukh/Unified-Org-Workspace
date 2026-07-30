const express = require('express');
const { z } = require('zod');
const { internalAuth } = require('@froncort/shared');
const auditService = require('../services/audit.service');
const { AUDIT_ACTIONS } = require('../lib/auditActions');

const router = express.Router();

const auditEventSchema = z.object({
  orgId: z.string().uuid(),
  actorId: z.string().uuid(),
  action: z.enum(AUDIT_ACTIONS),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  metadata: z.record(z.any()).optional(),
});

router.post('/audit-events', internalAuth, async (req, res, next) => {
  try {
    const body = auditEventSchema.parse(req.body);
    const entry = await auditService.recordEvent(body);
    res.status(201).json({ data: entry });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
