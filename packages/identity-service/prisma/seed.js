require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const bcrypt = require('bcrypt');
const { PrismaClient } = require('../src/generated/prisma-client');
const seedIds = require('../../shared/seedIds');

const prisma = new PrismaClient();

const SEED_PASSWORD = 'Password123!';

// Fixed IDs (from packages/shared/seedIds.js) so re-running this script
// (npx prisma db seed) is idempotent instead of accumulating duplicate
// rows, AND so other services' seed scripts (ticket-service Phase 3,
// pr-service Phase 4) can reference these exact users/orgs without a
// runtime cross-schema dependency. Originally only Organization/
// OrgConnection had fixed IDs here; Users didn't until Phase 3 needed to
// reference them deterministically too — see docs/project-progress.md's
// Phase 3 entry for the full story.
const ORG_ALPHA_ID = seedIds.ORG_ALPHA_ID;
const ORG_BETA_ID = seedIds.ORG_BETA_ID;
const CONNECTION_ID = seedIds.CONNECTION_ALPHA_BETA_ID;

async function upsertUser({ id, email, name, isPlatformAdmin = false }) {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  return prisma.user.upsert({
    where: { id },
    update: {},
    create: { id, email, name, passwordHash, isPlatformAdmin },
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

  const alphaAdmin = await upsertUser({ id: seedIds.USER_ALPHA_ADMIN_ID, email: 'admin@alpha.test', name: 'Alice Admin' });
  const alphaAgent = await upsertUser({ id: seedIds.USER_ALPHA_AGENT_ID, email: 'agent@alpha.test', name: 'Aaron Agent' });
  const alphaReviewer = await upsertUser({ id: seedIds.USER_ALPHA_REVIEWER_ID, email: 'reviewer@alpha.test', name: 'Ada Reviewer' });

  const betaAdmin = await upsertUser({ id: seedIds.USER_BETA_ADMIN_ID, email: 'admin@beta.test', name: 'Bianca Admin' });
  const betaAgent = await upsertUser({ id: seedIds.USER_BETA_AGENT_ID, email: 'agent@beta.test', name: 'Ben Agent' });
  const betaReviewer = await upsertUser({ id: seedIds.USER_BETA_REVIEWER_ID, email: 'reviewer@beta.test', name: 'Bea Reviewer' });

  // Locked: Platform Super Admin is seed-only, no promotion endpoint exists —
  // see CLAUDE.md rule and implementation_guide.md Phase 2.
  const platformAdmin = await upsertUser({
    id: seedIds.USER_PLATFORM_ADMIN_ID,
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

  // update: {} (not { status: 'APPROVED' }) — matching Organization's
  // pattern above. Re-running this seed must never force a connection back
  // to APPROVED if it was since revoked (whether manually or by the
  // application's own connection lifecycle); it should only ever create the
  // row on a genuinely fresh DB. A prior version of this upsert forced the
  // status on every reseed, which produced two simultaneously-APPROVED
  // Alpha<->Beta connections during Phase 3 testing (this row reset to
  // APPROVED by a reseed while a second, independently-approved connection
  // from earlier testing was already live) — exactly the ambiguity the
  // Phase 2 patch's duplicate-active-connection guard exists to prevent,
  // except the seed script writes directly via Prisma and bypasses that
  // guard entirely. See docs/project-progress.md's Phase 3 entry.
  const connection = await prisma.orgConnection.upsert({
    where: { id: CONNECTION_ID },
    update: {},
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
  // Reads the actual row back rather than assuming APPROVED — update: {}
  // means a reseed leaves whatever status the connection lifecycle already
  // put it in untouched (see the comment above this upsert).
  console.log(`  Connection: ${connection.status}, Alpha -> Beta (${CONNECTION_ID})`);
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
