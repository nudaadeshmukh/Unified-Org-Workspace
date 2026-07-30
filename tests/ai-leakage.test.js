const request = require('supertest');
const { startStack } = require('./helpers/bootstrap');

// Mocked BEFORE digest.service.js is required anywhere, so every call site
// that does `require('../lib/groqClient')` inside audit-service gets this
// mock instance instead of the real Groq client. No real API call happens.
jest.mock('../packages/audit-service/src/lib/groqClient', () => ({
  generateDigest: jest.fn().mockResolvedValue('mock digest text'),
}));

/**
 * The critical leakage boundary in this codebase is buildDigestPrompt
 * (packages/audit-service/src/services/digest.service.js) — it only ever
 * receives two small facts objects (assignedCount/overdueCount,
 * awaitingReviewCount/oldestIdleHours), never a raw ticket/PR row, a title,
 * or an orgId/userId. This test asserts on the EXACT prompt string passed
 * to the mocked Groq call, not on the stored digest output — that's the
 * whole reason Phase 5 built buildDigestPrompt as a standalone, directly
 * observable function in the first place.
 *
 * "Distinguishable fake data" here means a distinguishable NUMBER, not a
 * distinguishable title string — titles never reach buildDigestPrompt at
 * all (ticket-service's internal facts endpoint only ever returns counts),
 * so asserting a title never appears in the prompt would trivially always
 * pass regardless of whether the org-scoping actually worked, which would
 * be a fake test, not a rigorous one. Org B's ticket is deliberately
 * backdated past the overdue threshold so its overdueCount is a real,
 * distinguishable non-zero number unlikely to coincidentally match Org A's,
 * and a reviewer is deliberately given a real PR awaiting their review in
 * Org B specifically — both facts are proven to exist (and to reach the
 * correctly-scoped prompt) by generating Org B's OWN digest too, not just
 * asserted absent from Org A's.
 */
describe('ai-leakage.test.js', () => {
  let stack;
  let identityApp;
  let ticketApp;
  let prApp;
  let digestService;
  let groqClient;
  let ticketPrisma;

  let orgAId;
  let orgBId;
  let orgAAdminId;
  let orgBAdminId;
  let reviewerUserId;

  beforeAll(async () => {
    stack = await startStack({ identity: true, ticket: true, pr: true, audit: true });
    identityApp = require('../packages/identity-service/src/server');
    ticketApp = require('../packages/ticket-service/src/server');
    prApp = require('../packages/pr-service/src/server');
    // Required only after the mock above is registered.
    digestService = require('../packages/audit-service/src/services/digest.service');
    groqClient = require('../packages/audit-service/src/lib/groqClient');
    ticketPrisma = require('../packages/ticket-service/src/lib/prisma');

    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const orgARegister = await request(identityApp)
      .post('/auth/register')
      .send({
        email: `leak-a-${unique}@example.com`,
        password: 'TestPassword123!',
        name: 'Org A Admin',
        orgName: `AI Leakage Org A ${unique}`,
      })
      .expect(201);
    const orgAAdminToken = orgARegister.body.data.accessToken;
    orgAId = orgARegister.body.data.memberships[0].orgId;
    orgAAdminId = orgARegister.body.data.user.id;

    const orgBRegister = await request(identityApp)
      .post('/auth/register')
      .send({
        email: `leak-b-${unique}@example.com`,
        password: 'TestPassword123!',
        name: 'Org B Admin',
        orgName: `AI Leakage Org B ${unique}`,
      })
      .expect(201);
    const orgBAdminToken = orgBRegister.body.data.accessToken;
    orgBId = orgBRegister.body.data.memberships[0].orgId;
    orgBAdminId = orgBRegister.body.data.user.id;

    // --- Ticket facts fixture ---
    // Org A: 1 ticket, freshly created — assignedCount 1, overdueCount 0.
    const orgATicket = await request(ticketApp)
      .post('/tickets')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ title: 'Org A ticket', description: 'not overdue', assignedTo: orgAAdminId })
      .expect(201);
    expect(orgATicket.body.data.id).toBeTruthy();

    // Org B: 1 ticket, backdated past the overdue threshold — a real,
    // distinguishable overdueCount: 1 that must never surface in Org A's
    // prompt.
    const orgBTicket = await request(ticketApp)
      .post('/tickets')
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ title: 'Org B ticket', description: 'deliberately overdue', assignedTo: orgBAdminId })
      .expect(201);
    const thresholdDays = Number(process.env.TICKET_OVERDUE_THRESHOLD_DAYS) || 3;
    await ticketPrisma.ticket.update({
      where: { id: orgBTicket.body.data.id },
      data: { createdAt: new Date(Date.now() - (thresholdDays + 1) * 24 * 60 * 60 * 1000) },
    });

    // --- PR facts fixture ---
    // A single reviewer user, added as a REVIEWER member of BOTH orgs (same
    // multi-org-membership pattern already used elsewhere in this project),
    // but only actually assigned as a PR reviewer in Org B — so this exact
    // person's Org A facts are 0-awaiting and their Org B facts are
    // 1-awaiting, isolating the leakage boundary to org scoping alone, not
    // to which user is asking.
    const reviewerRegister = await request(identityApp)
      .post('/auth/register')
      .send({
        email: `leak-reviewer-${unique}@example.com`,
        password: 'TestPassword123!',
        name: 'Shared Reviewer',
        orgName: `AI Leakage Reviewer Home Org ${unique}`,
      })
      .expect(201);
    reviewerUserId = reviewerRegister.body.data.user.id;
    const reviewerEmail = `leak-reviewer-${unique}@example.com`;

    await request(identityApp)
      .post(`/orgs/${orgAId}/members`)
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ email: reviewerEmail, role: 'REVIEWER' })
      .expect(201);
    await request(identityApp)
      .post(`/orgs/${orgBId}/members`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ email: reviewerEmail, role: 'REVIEWER' })
      .expect(201);

    const orgBPR = await request(prApp)
      .post('/prs')
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ title: 'Org B PR awaiting review', description: 'fixture' })
      .expect(201);
    await request(prApp)
      .patch(`/prs/${orgBPR.body.data.id}`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ status: 'IN_REVIEW' })
      .expect(200);
    await request(prApp)
      .post(`/prs/${orgBPR.body.data.id}/reviewers`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ userId: reviewerUserId })
      .expect(201);
    // Deliberately left unreviewed — this is what makes it "awaiting."
  });

  afterAll(async () => {
    await stack.stop();
  });

  beforeEach(() => {
    groqClient.generateDigest.mockClear();
  });

  test("Org A admin's digest prompt reflects only Org A's ticket facts — Org B's distinguishable overdue count never appears", async () => {
    await digestService.generateDigestForMembership({ userId: orgAAdminId, orgId: orgAId });

    expect(groqClient.generateDigest).toHaveBeenCalledTimes(1);
    const prompt = groqClient.generateDigest.mock.calls[0][0];

    expect(prompt).toContain('Tickets assigned to you needing action: 1');
    expect(prompt).toContain('Of those, overdue: 0');
    // Org B's distinguishing fact — proven real by the next test — must not
    // appear here.
    expect(prompt).not.toContain('Of those, overdue: 1');
  });

  test("Org B admin's OWN digest prompt DOES show the distinguishing overdue count — proving the fact was real, not absent everywhere", async () => {
    await digestService.generateDigestForMembership({ userId: orgBAdminId, orgId: orgBId });

    expect(groqClient.generateDigest).toHaveBeenCalledTimes(1);
    const prompt = groqClient.generateDigest.mock.calls[0][0];

    expect(prompt).toContain('Tickets assigned to you needing action: 1');
    expect(prompt).toContain('Of those, overdue: 1');
  });

  test("the SAME reviewer's Org A digest shows 0 PRs awaiting review — Org B's real awaiting-review PR never appears", async () => {
    await digestService.generateDigestForMembership({ userId: reviewerUserId, orgId: orgAId });

    expect(groqClient.generateDigest).toHaveBeenCalledTimes(1);
    const prompt = groqClient.generateDigest.mock.calls[0][0];

    expect(prompt).toContain('Pull requests awaiting your review: 0');
    expect(prompt).toContain('No pull requests are currently awaiting your review.');
  });

  test("the SAME reviewer's Org B digest DOES show the awaiting PR — proving it was real, not absent everywhere", async () => {
    await digestService.generateDigestForMembership({ userId: reviewerUserId, orgId: orgBId });

    expect(groqClient.generateDigest).toHaveBeenCalledTimes(1);
    const prompt = groqClient.generateDigest.mock.calls[0][0];

    expect(prompt).toContain('Pull requests awaiting your review: 1');
    expect(prompt).toMatch(/idle for \d+ hours/);
  });

  test('buildDigestPrompt itself never accepts or emits anything beyond the two facts objects (no orgId/userId/title parameter exists to leak)', () => {
    const prompt = digestService.buildDigestPrompt({
      ticketFacts: { assignedCount: 4, overdueCount: 1 },
      prFacts: { awaitingReviewCount: 2, oldestIdleHours: 72 },
    });
    expect(prompt).not.toMatch(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}/i); // no UUIDs
    expect(prompt).not.toContain('@'); // no emails
    expect(prompt).not.toContain('Org'); // no org names
  });
});
