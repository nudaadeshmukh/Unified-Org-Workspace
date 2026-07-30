const express = require('express');
const { z } = require('zod');
const { authenticate, requireRole } = require('@froncort/shared');
const auditLogService = require('../services/auditLog.service');
const { AUDIT_ACTIONS } = require('../lib/auditActions');

const router = express.Router();

const isoDateString = z
  .string()
  .refine((val) => !Number.isNaN(Date.parse(val)), { message: 'Must be a valid date string' });

const auditLogQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  from: isoDateString.optional(),
  to: isoDateString.optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  format: z.enum(['csv']).optional(),
});

// "OA, REV (own org only)" per api_reference.md — PSA is not listed for
// this route (PSA's scope is orgs/connections/platform settings only, never
// ticket/PR/audit data — CLAUDE.md's Platform Super Admin scope), so this
// passes { allowPlatformAdmin: false } explicitly, same pattern as every
// ticket-service/pr-service call.
router.get(
  '/audit-log',
  authenticate,
  requireRole(['ORG_ADMIN', 'REVIEWER'], { allowPlatformAdmin: false }),
  async (req, res, next) => {
    try {
      const query = auditLogQuerySchema.parse(req.query);
      const rows = await auditLogService.queryAuditLog(req.user, query);

      if (query.format === 'csv') {
        const csv = auditLogService.toCsv(rows);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
        return res.send(csv);
      }

      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
