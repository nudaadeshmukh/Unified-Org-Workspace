const express = require('express');
const { z } = require('zod');
const { authenticate, requireRole } = require('@froncort/shared');
const ticketService = require('../services/ticket.service');
const commentService = require('../services/comment.service');
const attachmentService = require('../services/attachment.service');
const shareService = require('../services/share.service');
const { upload } = require('../lib/upload');
const { AppError } = require('../lib/errors');

const router = express.Router();

const STATUS_VALUES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const PRIORITY_VALUES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const createTicketSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(PRIORITY_VALUES).optional(),
  assignedTo: z.string().uuid().optional(),
});

const updateTicketSchema = z.object({
  status: z.enum(STATUS_VALUES).optional(),
  priority: z.enum(PRIORITY_VALUES).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
});

const listTicketsQuerySchema = z.object({
  status: z.enum(STATUS_VALUES).optional(),
});

const commentSchema = z.object({
  body: z.string().min(1),
});

const shareSchema = z.object({
  partnerOrgId: z.string().uuid(),
});

// No requireRole gate on PSA here: PSA has no ticket-service visibility at
// all (CLAUDE.md "Platform Super Admin scope"), enforced below wherever a
// role/org check happens — every requireRole() call in this file passes
// { allowPlatformAdmin: false } explicitly.

router.post(
  '/',
  authenticate,
  requireRole(['ORG_ADMIN', 'SUPPORT_AGENT'], { allowPlatformAdmin: false }),
  async (req, res, next) => {
    try {
      const body = createTicketSchema.parse(req.body);
      const ticket = await ticketService.createTicket(req.user, body);
      res.status(201).json({ data: ticket });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/', authenticate, async (req, res, next) => {
  try {
    const query = listTicketsQuerySchema.parse(req.query);
    const tickets = await ticketService.listTickets(req.user, query);
    res.json({ data: tickets });
  } catch (err) {
    next(err);
  }
});

// GET /tickets/:id — the BOLA-critical endpoint. No requireRole here: all 3
// OrgRole values are allowed for own-org access, and a GUEST's home-org role
// is irrelevant to whether their share grants them view+comment. Access is
// entirely decided by ticketService.getTicketForViewing (orgScope's 5-step
// check), not by role.
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const ticket = await ticketService.getTicketForViewing(req.params.id, req.user);
    res.json({ data: ticket });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  authenticate,
  requireRole(['ORG_ADMIN', 'SUPPORT_AGENT'], { allowPlatformAdmin: false }),
  async (req, res, next) => {
    try {
      const body = updateTicketSchema.parse(req.body);
      const ticket = await ticketService.updateTicket(req.params.id, req.user, body);
      res.json({ data: ticket });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/:id',
  authenticate,
  requireRole(['ORG_ADMIN'], { allowPlatformAdmin: false }),
  async (req, res, next) => {
    try {
      await ticketService.deleteTicket(req.params.id, req.user);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// Comments: same "no role gate" reasoning as GET /tickets/:id — OA/SA/REV
// covers every own-org role, and GUEST comment rights don't depend on role.
router.post('/:id/comments', authenticate, async (req, res, next) => {
  try {
    const body = commentSchema.parse(req.body);
    const comment = await commentService.createComment(req.params.id, req.user, body);
    res.status(201).json({ data: comment });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/comments', authenticate, async (req, res, next) => {
  try {
    const comments = await commentService.listComments(req.params.id, req.user);
    res.json({ data: comments });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/attachments',
  authenticate,
  requireRole(['ORG_ADMIN', 'SUPPORT_AGENT'], { allowPlatformAdmin: false }),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new AppError('No file uploaded — expected multipart field "file"', 400, 'VALIDATION_ERROR');
      }
      const attachment = await attachmentService.createAttachment(req.params.id, req.user, req.file);
      res.status(201).json({ data: attachment });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/:id/attachments', authenticate, async (req, res, next) => {
  try {
    const attachments = await attachmentService.listAttachments(req.params.id, req.user);
    res.json({ data: attachments });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/shares',
  authenticate,
  requireRole(['ORG_ADMIN'], { allowPlatformAdmin: false }),
  async (req, res, next) => {
    try {
      const body = shareSchema.parse(req.body);
      const share = await shareService.createShare(req.params.id, req.user, body);
      res.status(201).json({ data: share });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:id/shares',
  authenticate,
  requireRole(['ORG_ADMIN'], { allowPlatformAdmin: false }),
  async (req, res, next) => {
    try {
      const shares = await shareService.listShares(req.params.id, req.user);
      res.json({ data: shares });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/:id/shares/:shareId',
  authenticate,
  requireRole(['ORG_ADMIN'], { allowPlatformAdmin: false }),
  async (req, res, next) => {
    try {
      await shareService.revokeShare(req.params.id, req.params.shareId, req.user);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
