require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { PrismaClient } = require('../src/generated/prisma-client');
const seedIds = require('../../shared/seedIds');

const prisma = new PrismaClient();

// Fixed IDs for this service's own rows, plus the shared identity-service
// IDs (packages/shared/seedIds.js) needed to reference the right
// org/user without a runtime cross-schema dependency — see
// docs/project-progress.md's Phase 3 entry for why User IDs had to become
// fixed in identity-service's own seed script for this to work at all.
const TICKET_1_ID = '10000000-0000-0000-0000-000000000001';
const TICKET_2_ID = '10000000-0000-0000-0000-000000000002';
const TICKET_3_ID = '10000000-0000-0000-0000-000000000003';
const COMMENT_1_ID = '20000000-0000-0000-0000-000000000001';
const SHARE_1_ID = '30000000-0000-0000-0000-000000000001';

async function main() {
  console.log('Seeding ticket-service...');

  // 3 tickets (per master spec's seed plan)
  const ticket1 = await prisma.ticket.upsert({
    where: { id: TICKET_1_ID },
    update: {},
    create: {
      id: TICKET_1_ID,
      orgId: seedIds.ORG_ALPHA_ID,
      title: 'Login page throws 500 on SSO redirect',
      description: 'Customer reports a 500 error when redirected back from the SSO provider.',
      status: 'OPEN',
      priority: 'HIGH',
      assignedTo: seedIds.USER_ALPHA_AGENT_ID,
      createdBy: seedIds.USER_ALPHA_ADMIN_ID,
    },
  });

  await prisma.ticket.upsert({
    where: { id: TICKET_2_ID },
    update: {},
    create: {
      id: TICKET_2_ID,
      orgId: seedIds.ORG_ALPHA_ID,
      title: 'Feature request: dark mode',
      description: 'Several users have asked for a dark mode toggle in settings.',
      status: 'IN_PROGRESS',
      priority: 'LOW',
      assignedTo: seedIds.USER_ALPHA_AGENT_ID,
      createdBy: seedIds.USER_ALPHA_ADMIN_ID,
    },
  });

  await prisma.ticket.upsert({
    where: { id: TICKET_3_ID },
    update: {},
    create: {
      id: TICKET_3_ID,
      orgId: seedIds.ORG_BETA_ID,
      title: 'Billing invoice missing tax line',
      description: 'The last invoice generated is missing the expected tax breakdown.',
      status: 'OPEN',
      priority: 'MEDIUM',
      createdBy: seedIds.USER_BETA_ADMIN_ID,
    },
  });

  // 1 comment
  await prisma.comment.upsert({
    where: { id: COMMENT_1_ID },
    update: {},
    create: {
      id: COMMENT_1_ID,
      ticketId: ticket1.id,
      authorId: seedIds.USER_ALPHA_AGENT_ID,
      body: 'Looking into this now — can reproduce on staging.',
    },
  });

  // 2 feature flags
  await prisma.featureFlag.upsert({
    where: { orgId_key: { orgId: seedIds.ORG_ALPHA_ID, key: 'AI_DIGEST_ENABLED' } },
    update: {},
    create: { orgId: seedIds.ORG_ALPHA_ID, key: 'AI_DIGEST_ENABLED', enabled: true },
  });
  await prisma.featureFlag.upsert({
    where: { orgId_key: { orgId: seedIds.ORG_BETA_ID, key: 'AI_DIGEST_ENABLED' } },
    update: {},
    create: { orgId: seedIds.ORG_BETA_ID, key: 'AI_DIGEST_ENABLED', enabled: false },
  });

  // 1 cross-org share: ticket1 (Alpha) shared with Beta. Relies on
  // identity-service's seeded Alpha<->Beta connection being APPROVED.
  await prisma.ticketShare.upsert({
    where: { id: SHARE_1_ID },
    update: {},
    create: {
      id: SHARE_1_ID,
      ticketId: ticket1.id,
      partnerOrgId: seedIds.ORG_BETA_ID,
      sharedBy: seedIds.USER_ALPHA_ADMIN_ID,
    },
  });

  console.log('Seed complete.');
  console.log('  3 tickets, 1 comment, 2 feature flags, 1 cross-org share (ticket1 -> Beta).');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
