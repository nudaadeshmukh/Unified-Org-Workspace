const express = require('express');
const { authenticate } = require('@froncort/shared');
const notificationService = require('../services/notification.service');

const router = express.Router();

// "ANY (own only)" — no requireRole gate, every authenticated user (any
// role, any org) can see their own notifications. Ownership is enforced in
// notification.service.js, not by role.
router.get('/', authenticate, async (req, res, next) => {
  try {
    const notifications = await notificationService.listNotifications(req.user);
    res.json({ data: notifications });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', authenticate, async (req, res, next) => {
  try {
    const notification = await notificationService.markRead(req.params.id, req.user);
    res.json({ data: notification });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
