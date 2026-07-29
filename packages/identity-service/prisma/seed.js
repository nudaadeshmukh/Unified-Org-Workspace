require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const bcrypt = require('bcrypt');
const { PrismaClient } = require('../src/generated/prisma-client');

const prisma = new PrismaClient();

const SEED_PASSWORD = 'Password123!';

// Fixed IDs so re-running this script (npx prisma db seed) is idempotent
// instead of accumulating duplicate orgs/connections on every run.
const ORG_ALPHA_ID = '00000000-0000-0000-0000-0000000a1fa0';
const ORG_BETA_ID = '00000000-0000-0000-0000-0000000be7a0';
const CONNECTION_ID = '00000000-0000-0000-0000-00000000c001';

async function upsertUser({ email, name, isPlatformAdmin = false }) {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, passwordHash, isPlatformAdmin },
  });
}

async function upsertMembership(userId, orgId, role) {
  return prisma.orgMembership.upsert({
    where: { userId_orgId: { userId, orgId } },
    update: { role },
    create: { userId, orgId, role },
  });
}

async function main() {
  console.log('Seeding identity-service...');

  const orgAlpha = await prisma.organization.upsert({
    where: { id: ORG_ALPHA_ID },
    update: {},
    create: { id: ORG_ALPHA_ID, name: 'Alpha Support Co.' },
  });
  const orgBeta = await prisma.organization.upsert({
    where: { id: ORG_BETA_ID },
    update: {},
    create: { id: ORG_BETA_ID, name: 'Beta Review Partners' },
  });

  const alphaAdmin = await upsertUser({ email: 'admin@alpha.test', name: 'Alice Admin' });
  const alphaAgent = await upsertUser({ email: 'agent@alpha.test', name: 'Aaron Agent' });
  const alphaReviewer = await upsertUser({ email: 'reviewer@alpha.test', name: 'Ada Reviewer' });

  const betaAdmin = await upsertUser({ email: 'admin@beta.test', name: 'Bianca Admin' });
  const betaAgent = await upsertUser({ email: 'agent@beta.test', name: 'Ben Agent' });
  const betaReviewer = await upsertUser({ email: 'reviewer@beta.test', name: 'Bea Reviewer' });

  // Locked: Platform Super Admin is seed-only, no promotion endpoint exists —
  // see CLAUDE.md rule and implementation_guide.md Phase 2.
  const platformAdmin = await upsertUser({
    email: 'super@froncort.ai',
    name: 'Platform Super Admin',
    isPlatformAdmin: true,
  });

  await Promise.all([
    upsertMembership(alphaAdmin.id, orgAlpha.id, 'ORG_ADMIN'),
    upsertMembership(alphaAgent.id, orgAlpha.id, 'SUPPORT_AGENT'),
    upsertMembership(alphaReviewer.id, orgAlpha.id, 'REVIEWER'),
    upsertMembership(betaAdmin.id, orgBeta.id, 'ORG_ADMIN'),
    upsertMembership(betaAgent.id, orgBeta.id, 'SUPPORT_AGENT'),
    upsertMembership(betaReviewer.id, orgBeta.id, 'REVIEWER'),
  ]);

  await prisma.orgConnection.upsert({
    where: { id: CONNECTION_ID },
    update: { status: 'APPROVED' },
    create: {
      id: CONNECTION_ID,
      requesterOrgId: orgAlpha.id,
      targetOrgId: orgBeta.id,
      status: 'APPROVED',
    },
  });

  console.log('Seed complete.');
  console.log(`  Org Alpha: ${orgAlpha.name} (${orgAlpha.id})`);
  console.log(`  Org Beta:  ${orgBeta.name} (${orgBeta.id})`);
  console.log(`  Connection: APPROVED, Alpha -> Beta (${CONNECTION_ID})`);
  console.log(`  All seeded users share the password: ${SEED_PASSWORD}`);
  console.log('  Users: admin/agent/reviewer @alpha.test and @beta.test, plus', platformAdmin.email, '(Platform Super Admin)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
