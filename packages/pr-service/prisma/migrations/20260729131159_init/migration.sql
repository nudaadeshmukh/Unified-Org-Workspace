-- CreateEnum
CREATE TYPE "PRStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'MERGED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('APPROVED', 'CHANGES_REQUESTED');

-- CreateTable
CREATE TABLE "PullRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "PRStatus" NOT NULL DEFAULT 'DRAFT',
    "authorId" TEXT NOT NULL,
    "requiredApprovals" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PullRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PRVersion" (
    "id" TEXT NOT NULL,
    "prId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PRVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PRReviewer" (
    "id" TEXT NOT NULL,
    "prId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PRReviewer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PRReview" (
    "id" TEXT NOT NULL,
    "prId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PRReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PRShare" (
    "id" TEXT NOT NULL,
    "prId" TEXT NOT NULL,
    "partnerOrgId" TEXT NOT NULL,
    "sharedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PRShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PullRequest_orgId_idx" ON "PullRequest"("orgId");

-- CreateIndex
CREATE INDEX "PRVersion_prId_idx" ON "PRVersion"("prId");

-- CreateIndex
CREATE INDEX "PRReviewer_prId_idx" ON "PRReviewer"("prId");

-- CreateIndex
CREATE UNIQUE INDEX "PRReviewer_prId_userId_key" ON "PRReviewer"("prId", "userId");

-- CreateIndex
CREATE INDEX "PRReview_prId_idx" ON "PRReview"("prId");

-- CreateIndex
CREATE INDEX "PRShare_prId_idx" ON "PRShare"("prId");

-- CreateIndex
CREATE INDEX "PRShare_partnerOrgId_idx" ON "PRShare"("partnerOrgId");

-- AddForeignKey
ALTER TABLE "PRVersion" ADD CONSTRAINT "PRVersion_prId_fkey" FOREIGN KEY ("prId") REFERENCES "PullRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PRReviewer" ADD CONSTRAINT "PRReviewer_prId_fkey" FOREIGN KEY ("prId") REFERENCES "PullRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PRReview" ADD CONSTRAINT "PRReview_prId_fkey" FOREIGN KEY ("prId") REFERENCES "PullRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PRShare" ADD CONSTRAINT "PRShare_prId_fkey" FOREIGN KEY ("prId") REFERENCES "PullRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
