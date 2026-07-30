require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { PrismaClient } = require('../src/generated/prisma-client');
const seedIds = require('../../shared/seedIds');

const prisma = new PrismaClient();

// Fixed IDs for this service's own rows, plus the shared identity-service
// IDs (packages/shared/seedIds.js) needed to reference the right org/user
// without a runtime cross-schema dependency — same pattern as
// ticket-service's Phase 3 seed script.
const PR_1_ID = '40000000-0000-0000-0000-000000000001';
const PR_2_ID = '40000000-0000-0000-0000-000000000002';
const PR_1_VERSION_1_ID = '50000000-0000-0000-0000-000000000001';
const PR_1_REVIEWER_ID = '60000000-0000-0000-0000-000000000001';
const PR_1_REVIEW_ID = '70000000-0000-0000-0000-000000000001';
const PR_1_SHARE_ID = '80000000-0000-0000-0000-000000000001';

const PR_1_TITLE = 'Add rate limiting to the public API';
const PR_1_DESCRIPTION = 'Introduces a token-bucket limiter in front of the public REST endpoints.';

async function main() {
  console.log('Seeding pr-service...');

  // 2 PRs (per master spec's seed plan)
  const pr1 = await prisma.pullRequest.upsert({
    where: { id: PR_1_ID },
    update: {},
    create: {
      id: PR_1_ID,
      orgId: seedIds.ORG_ALPHA_ID,
      title: PR_1_TITLE,
      description: PR_1_DESCRIPTION,
      status: 'IN_REVIEW',
      authorId: seedIds.USER_ALPHA_ADMIN_ID,
      requiredApprovals: 2,
    },
  });

  await prisma.pullRequest.upsert({
    where: { id: PR_2_ID },
    update: {},
    create: {
      id: PR_2_ID,
      orgId: seedIds.ORG_BETA_ID,
      title: 'Refactor invoice PDF generation',
      description: 'Swaps the invoice renderer for a faster library ahead of the tax-line fix.',
      status: 'DRAFT',
      authorId: seedIds.USER_BETA_ADMIN_ID,
    },
  });

  // 1 version — baseline snapshot taken when pr1 was submitted for review
  // (see pr.service.js's updatePR: version 1 always mirrors the content at
  // the moment of the DRAFT -> IN_REVIEW transition).
  await prisma.pRVersion.upsert({
    where: { id: PR_1_VERSION_1_ID },
    update: {},
    create: {
      id: PR_1_VERSION_1_ID,
      prId: pr1.id,
      versionNumber: 1,
      title: PR_1_TITLE,
      description: PR_1_DESCRIPTION,
    },
  });

  // 1 reviewer assignment
  await prisma.pRReviewer.upsert({
    where: { id: PR_1_REVIEWER_ID },
    update: {},
    create: {
      id: PR_1_REVIEWER_ID,
      prId: pr1.id,
      userId: seedIds.USER_ALPHA_REVIEWER_ID,
    },
  });

  // 1 changes-requested review
  await prisma.pRReview.upsert({
    where: { id: PR_1_REVIEW_ID },
    update: {},
    create: {
      id: PR_1_REVIEW_ID,
      prId: pr1.id,
      reviewerId: seedIds.USER_ALPHA_REVIEWER_ID,
      status: 'CHANGES_REQUESTED',
      comment: 'Needs a test covering the burst-limit edge case before this can be approved.',
    },
  });

  // 1 cross-org share: pr1 (Alpha) shared with Beta. Relies on
  // identity-service's seeded Alpha<->Beta connection being APPROVED.
  await prisma.pRShare.upsert({
    where: { id: PR_1_SHARE_ID },
    update: {},
    create: {
      id: PR_1_SHARE_ID,
      prId: pr1.id,
      partnerOrgId: seedIds.ORG_BETA_ID,
      sharedBy: seedIds.USER_ALPHA_ADMIN_ID,
    },
  });

  console.log('Seed complete.');
  console.log('  2 PRs, 1 version, 1 reviewer, 1 changes-requested review, 1 cross-org share (pr1 -> Beta).');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
