const express = require('express');
const { z } = require('zod');
const { authenticate, requireRole } = require('@froncort/shared');
const orgService = require('../services/org.service');
const connectionService = require('../services/connection.service');

const router = express.Router();

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ORG_ADMIN', 'SUPPORT_AGENT', 'REVIEWER']),
});
const updateMemberSchema = z.object({
  role: z.enum(['ORG_ADMIN', 'SUPPORT_AGENT', 'REVIEWER']),
});
const createConnectionSchema = z.object({
  targetOrgId: z.string().uuid(),
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const org = await orgService.getOrg(req.params.id, req.user);
    res.json({ data: org });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/members',
  authenticate,
  requireRole(['ORG_ADMIN'], { allowPlatformAdmin: true }),
  async (req, res, next) => {
    try {
      const body = addMemberSchema.parse(req.body);
      const membership = await orgService.addMember(req.params.id, req.user, body);
      res.status(201).json({ data: membership });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id/members/:userId',
  authenticate,
  requireRole(['ORG_ADMIN'], { allowPlatformAdmin: true }),
  async (req, res, next) => {
    try {
      const body = updateMemberSchema.parse(req.body);
      const membership = await orgService.updateMemberRole(req.params.id, req.params.userId, req.user, body);
      res.json({ data: membership });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/:id/members/:userId',
  authenticate,
  requireRole(['ORG_ADMIN'], { allowPlatformAdmin: true }),
  async (req, res, next) => {
    try {
      await orgService.removeMember(req.params.id, req.params.userId, req.user);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// api_reference.md excludes PSA from this route entirely — requireRole()'s
// PSA bypass is explicit opt-in (CLAUDE.md's "Platform Super Admin scope"),
// so allowPlatformAdmin: false here. The own-org-admin-only 404 check still
// happens inside connectionService (role is right by the time it gets
// there; org may not be).
router.post(
  '/:id/connections',
  authenticate,
  requireRole(['ORG_ADMIN'], { allowPlatformAdmin: false }),
  async (req, res, next) => {
    try {
      const body = createConnectionSchema.parse(req.body);
      const connection = await connectionService.requestConnection(req.params.id, req.user, body);
      res.status(201).json({ data: connection });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:id/connections',
  authenticate,
  requireRole(['ORG_ADMIN'], { allowPlatformAdmin: true }),
  async (req, res, next) => {
    try {
      const connections = await connectionService.listConnections(req.params.id, req.user);
      res.json({ data: connections });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
