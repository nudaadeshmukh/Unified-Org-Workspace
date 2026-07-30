const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { orgScope } = require('@froncort/shared');
const prisma = require('../lib/prisma');
const { UPLOAD_DIR } = require('../lib/upload');
const { resolveTicketAccess, logAudit, TICKET_NOT_FOUND } = require('./ticket.service');

/**
 * POST /tickets/:id/attachments — "OA, SA (own org only) — guests cannot
 * upload." Deliberately checked via `ownsResource` directly (not
 * `resolveTicketAccess`) — a guest whose *home* org role happens to be
 * ORG_ADMIN/SUPPORT_AGENT must still be rejected, since this is an own-org
 * restriction that no share can satisfy, not just a role restriction.
 *
 * The file only gets written to disk after BOTH the ownership check and the
 * blocking audit call pass — writing it any earlier risks the same class of
 * orphaned-file bug Phase 3 already found and fixed once (there, it was an
 * authorization failure after the write; here it would be an audit-call
 * failure after the write). See lib/upload.js for why multer uses
 * memoryStorage rather than writing unconditionally as soon as the request
 * arrives.
 */
async function createAttachment(ticketId, caller, file) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || !orgScope.ownsResource(ticket.orgId, caller.activeOrgId)) {
    throw TICKET_NOT_FOUND();
  }

  const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = `${crypto.randomUUID()}-${safeOriginalName}`;
  const attachmentId = crypto.randomUUID();

  await logAudit({
    orgId: caller.activeOrgId,
    actorId: caller.id,
    action: 'ATTACHMENT_ADDED',
    entityType: 'Attachment',
    entityId: attachmentId,
    metadata: { ticketId, fileName: file.originalname },
  });

  await fs.writeFile(path.join(UPLOAD_DIR, filename), file.buffer);

  return prisma.attachment.create({
    data: {
      id: attachmentId,
      ticketId,
      uploadedBy: caller.id,
      fileUrl: `/uploads/${filename}`,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    },
  });
}

/** GET /tickets/:id/attachments — same access rule as GET /tickets/:id. */
async function listAttachments(ticketId, caller) {
  const { ticket, access } = await resolveTicketAccess(ticketId, caller);
  if (!ticket || !access) {
    throw TICKET_NOT_FOUND();
  }
  return prisma.attachment.findMany({ where: { ticketId }, orderBy: { createdAt: 'desc' } });
}

module.exports = { createAttachment, listAttachments };
