const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');

const NOTIFICATION_NOT_FOUND = () => new AppError('Notification not found', 404, 'NOT_FOUND');

/** GET /notifications — "ANY (own only)", unread-first ordering. */
async function listNotifications(caller) {
  return prisma.notification.findMany({
    where: { userId: caller.id },
    orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
  });
}

/**
 * PATCH /notifications/:id/read — "ANY (own only)". A notification that
 * exists but belongs to someone else is 404, not 403 — CLAUDE.md rule #2,
 * same discipline as every other own-resource check in this project.
 */
async function markRead(notificationId, caller) {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification || notification.userId !== caller.id) {
    throw NOTIFICATION_NOT_FOUND();
  }

  return prisma.notification.update({ where: { id: notificationId }, data: { read: true } });
}

/** Used internally by the AI digest job (digest.service.js) — not a route. */
async function createDigestNotification({ userId, orgId, body }) {
  return prisma.notification.create({
    data: { userId, orgId, type: 'AI_DIGEST', title: 'Your digest', body, read: false },
  });
}

module.exports = { listNotifications, markRead, createDigestNotification };
