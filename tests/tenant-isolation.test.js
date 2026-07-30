const request = require('supertest');
const { startStack } = require('./helpers/bootstrap');

/**
 * A manipulated foreign-org ID (a real resource ID that belongs to a
 * different org than the caller's) must 404 — and the response body must
 * contain NO trace of the resource, not just the right status code. A test
 * that only checked `res.status === 404` would still pass even if a future
 * regression accidentally leaked the resource's title/description alongside
 * a 404 status — asserting on `res.body` explicitly is the whole point.
 */
describe('tenant-isolation.test.js', () => {
  let stack;
  let identityApp;
  let ticketApp;
  let prApp;

  let orgAAdminToken;
  let orgBAdminToken;
  let orgATicketId;
  let orgAPRId;

  beforeAll(async () => {
    // audit: true is required even though this suite never calls audit-service
    // routes directly — ticket/PR creation now blocks on a real audit-service
    // call before writing (CLAUDE.md rule #9), so it has to be running.
    stack = await startStack({ identity: true, ticket: true, pr: true, audit: true });
    identityApp = require('../packages/identity-service/src/server');
    ticketApp = require('../packages/ticket-service/src/server');
    prApp = require('../packages/pr-service/src/server');

    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const orgARegister = await request(identityApp)
      .post('/auth/register')
      .send({
        email: `tenant-a-${unique}@example.com`,
        password: 'TestPassword123!',
        name: 'Org A Admin',
        orgName: `Tenant Isolation Org A ${unique}`,
      })
      .expect(201);
    orgAAdminToken = orgARegister.body.data.accessToken;

    const orgBRegister = await request(identityApp)
      .post('/auth/register')
      .send({
        email: `tenant-b-${unique}@example.com`,
        password: 'TestPassword123!',
        name: 'Org B Admin',
        orgName: `Tenant Isolation Org B ${unique}`,
      })
      .expect(201);
    orgBAdminToken = orgBRegister.body.data.accessToken;

    // A real ticket and a real PR, both owned by org A, never shared with
    // org B — the resources org B's admin will try (and fail) to reach.
    const ticketRes = await request(ticketApp)
      .post('/tickets')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ title: 'Org A only — never shared', description: 'BOLA test fixture' })
      .expect(201);
    orgATicketId = ticketRes.body.data.id;

    const prRes = await request(prApp)
      .post('/prs')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ title: 'Org A only PR — never shared', description: 'BOLA test fixture' })
      .expect(201);
    orgAPRId = prRes.body.data.id;
  });

  afterAll(async () => {
    await stack.stop();
  });

  test('GET /tickets/:id with a foreign-org ticket ID returns 404 with no ticket data in the body', async () => {
    const res = await request(ticketApp).get(`/tickets/${orgATicketId}`).set('Authorization', `Bearer ${orgBAdminToken}`);

    expect(res.status).toBe(404);
    // The single most important assertion in this file: the body contains
    // ONLY the error envelope, nothing resembling ticket data.
    expect(res.body).toEqual({
      error: { message: expect.any(String), code: 'NOT_FOUND' },
    });
    expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('Org A only');
  });

  test('PATCH /tickets/:id with a foreign-org ticket ID returns 404 with no ticket data in the body', async () => {
    const res = await request(ticketApp)
      .patch(`/tickets/${orgATicketId}`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ status: 'CLOSED' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: expect.any(String), code: 'NOT_FOUND' } });
    expect(JSON.stringify(res.body)).not.toContain('Org A only');
  });

  test('GET /prs/:id with a foreign-org PR ID returns 404 with no PR data in the body', async () => {
    const res = await request(prApp).get(`/prs/${orgAPRId}`).set('Authorization', `Bearer ${orgBAdminToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: expect.any(String), code: 'NOT_FOUND' } });
    expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('Org A only');
  });

  test('PATCH /prs/:id with a foreign-org PR ID returns 404 with no PR data in the body', async () => {
    const res = await request(prApp)
      .patch(`/prs/${orgAPRId}`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ status: 'REJECTED' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: expect.any(String), code: 'NOT_FOUND' } });
    expect(JSON.stringify(res.body)).not.toContain('Org A only');
  });

  test('a fabricated, entirely nonexistent ID gets the identical 404 shape (indistinguishable from the real-but-foreign case)', async () => {
    const fabricatedId = '00000000-0000-0000-0000-000000000000';
    const ticketRes = await request(ticketApp).get(`/tickets/${fabricatedId}`).set('Authorization', `Bearer ${orgBAdminToken}`);
    const prRes = await request(prApp).get(`/prs/${fabricatedId}`).set('Authorization', `Bearer ${orgBAdminToken}`);

    expect(ticketRes.status).toBe(404);
    expect(ticketRes.body).toEqual({ error: { message: expect.any(String), code: 'NOT_FOUND' } });
    expect(prRes.status).toBe(404);
    expect(prRes.body).toEqual({ error: { message: expect.any(String), code: 'NOT_FOUND' } });
  });
});
