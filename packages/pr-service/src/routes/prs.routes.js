const express = require('express');
const { z } = require('zod');
const { authenticate, requireRole } = require('@froncort/shared');
const prService = require('../services/pr.service');
const reviewerService = require('../services/reviewer.service');
const reviewService = require('../services/review.service');
const versionService = require('../services/version.service');
const shareService = require('../services/share.service');

const router = express.Router();

const PR_STATUS_VALUES = ['IN_REVIEW', 'REJECTED', 'MERGED'];

const createPRSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  requiredApprovals: z.number().int().min(1).optional(),
});

const updatePRSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    requiredApprovals: z.number().int().min(1).optional(),
    status: z.enum(PR_STATUS_VALUES).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'At least one field must be provided' });

const addReviewerSchema = z.object({
  userId: z.string().uuid(),
});

const reviewSchema = z.object({
  status: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
  comment: z.string().optional(),
});

const shareSchema = z.object({
  partnerOrgId: z.string().uuid(),
});

// No requireRole gate for PSA anywhere in this file: PSA has zero pr-service
// visibility (CLAUDE.md "Platform Super Admin scope"), so every requireRole
// call below passes { allowPlatformAdmin: false } explicitly.
//
// Bug fixed post-Phase-4: the GET routes below used to carry a router-level
// requireRole(['ORG_ADMIN', 'REVIEWER']) gate, on the reasoning that
// SUPPORT_AGENT has zero pr-service visibility. That's true for OWN-ORG
// visibility, but the router gate ran before any share-access check could
// — so it also blocked a legitimate cross-org GUEST whose home-org role
// happens to be SUPPORT_AGENT, which is exactly the CROSS_ORG_GUEST
// violation CLAUDE.md warns about (Guest access must be decided by
// share/connection state, never by role). Matches ticket-service's pattern
// now: no router-level role gate on GET routes at all. The OA/REV-only
// restriction for own-org visibility is enforced inside pr.service.js
// (resolvePRAccess's OWNER branch, listPRs), where it can coexist with an
// unrestricted share/GUEST branch.

// POST /prs — OA only. Not "OA or SA-equivalent authors" as an earlier
// draft of api_reference.md read; SA has no pr-service access at all, and
// REVIEWER's scope is reviewing, not authoring — see the Phase 4 note.
router.post(
  '/',
  authenticate,
  requireRole(['ORG_ADMIN'], { allowPlatformAdmin: false }),
  async (req, res, next) => {
    try {
      const body = createPRSchema.parse(req.body);
      const pr = await prService.createPR(req.user, body);
      res.status(201).json({ data: pr });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/', authenticate, async (req, res, next) => {
  try {
    const prs = await prService.listPRs(req.user);
    res.json({ data: prs });
  } catch (err) {
    next(err);
  }
});

// GET /prs/:id — the BOLA-critical endpoint. No requireRole here: access is
// entirely decided by prService.getPRForViewing (own-org OA/REV, or a valid
// cross-org share regardless of the guest's home-org role).
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const pr = await prService.getPRForViewing(req.params.id, req.user);
    res.json({ data: pr });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  authenticate,
  requireRole(['ORG_ADMIN'], { allowPlatformAdmin: false }),
  async (req, res, next) => {
    try {
      const body = updatePRSchema.parse(req.body);
      const pr = await prService.updatePR(req.params.id, req.user, body);
      res.json({ data: pr });
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
      await prService.deletePR(req.params.id, req.user);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/reviewers',
  authenticate,
  requireRole(['ORG_ADMIN'], { allowPlatformAdmin: false }),
  async (req, res, next) => {
    try {
      const body = addReviewerSchema.parse(req.body);
      const reviewer = await reviewerService.addReviewer(req.params.id, req.user, body);
      res.status(201).json({ data: reviewer });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/reviews',
  authenticate,
  requireRole(['ORG_ADMIN', 'REVIEWER'], { allowPlatformAdmin: false }),
  async (req, res, next) => {
    try {
      const body = reviewSchema.parse(req.body);
      const review = await reviewService.submitReview(req.params.id, req.user, body);
      res.status(201).json({ data: review });
    } catch (err) {
      next(err);
    }
  }
);

// Same access as GET /prs/:id (api_reference.md) — no requireRole gate,
// versionService.listVersions/getDiff both go through resolvePRAccess.
router.get('/:id/versions', authenticate, async (req, res, next) => {
  try {
    const versions = await versionService.listVersions(req.params.id, req.user);
    res.json({ data: versions });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/versions/:n/diff', authenticate, async (req, res, next) => {
  try {
    const diff = await versionService.getDiff(req.params.id, req.params.n, req.user);
    res.json({ data: diff });
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
