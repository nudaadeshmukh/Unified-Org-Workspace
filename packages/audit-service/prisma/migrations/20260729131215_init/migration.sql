-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('TICKET_CREATED', 'TICKET_UPDATED', 'TICKET_DELETED', 'TICKET_SHARED', 'TICKET_SHARE_REVOKED', 'COMMENT_ADDED', 'ATTACHMENT_ADDED', 'PR_CREATED', 'PR_STATUS_CHANGED', 'PR_APPROVED', 'PR_CHANGES_REQUESTED', 'PR_MERGED', 'PR_SHARED', 'PR_SHARE_REVOKED', 'CONNECTION_REQUESTED', 'CONNECTION_APPROVED', 'CONNECTION_REVOKED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('AI_DIGEST', 'SYSTEM');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_orgId_idx" ON "AuditLog"("orgId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
