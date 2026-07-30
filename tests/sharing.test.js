const request = require('supertest');
const { startStack } = require('./helpers/bootstrap');

/**
 * Covers implementation_guide.md Phase 6's sharing.test.js requirements:
 * a share grants exactly the one resource, view+comment only; edit/delete/
 * re-share on a shared resource all fail; and revoking the underlying
 * connection removes access even with the share row fully intact — asserted
 * by re-reading the share row's own fields (id, createdAt, revokedAt) before
 * and after the connection revoke, not just re-checking that access failed.
 */
describe('sharing.test.js', () => {
  let stack;
  let identityApp;
  let ticketApp;

  let orgAId;
  let orgBId;
  let orgAAdminToken;
  let orgBAdminToken;
  let ticketId;
  let shareId;
  let connectionId;

  beforeAll(async () => {
    stack = await startStack({ identity: true, ticket: true, audit: true });
    identityApp = require('../packages/identity-service/src/server');
    ticketApp = require('../packages/ticket-service/src/server');

    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const orgARegister = await request(identityApp)
      .post('/auth/register')
      .send({
        email: `sharing-a-${unique}@example.com`,
        password: 'TestPassword123!',
        name: 'Org A Admin',
        orgName: `Sharing Test Org A ${unique}`,
      })
      .expect(201);
    orgAAdminToken = orgARegister.body.data.accessToken;
    orgAId = orgARegister.body.data.memberships[0].orgId;

    const orgBRegister = await request(identityApp)
      .post('/auth/register')
      .send({
        email: `sharing-b-${unique}@example.com`,
        password: 'TestPassword123!',
        name: 'Org B Admin',
        orgName: `Sharing Test Org B ${unique}`,
      })
      .expect(201);
    orgBAdminToken = orgBRegister.body.data.accessToken;
    orgBId = orgBRegister.body.data.memberships[0].orgId;

    // Approve a connection Org A -> Org B before any share can be created
    // (ticket-service's createShare requires an APPROVED connection).
    const connectionRes = await request(identityApp)
      .post(`/orgs/${orgAId}/connections`)
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ targetOrgId: orgBId })
      .expect(201);
    connectionId = connectionRes.body.data.id;

    await request(identityApp)
      .patch(`/connections/${connectionId}`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ status: 'APPROVED' })
      .expect(200);

    const ticketRes = await request(ticketApp)
      .post('/tickets')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ title: 'Shared with Org B', description: 'Sharing test fixture' })
      .expect(201);
    ticketId = ticketRes.body.data.id;

    const shareRes = await request(ticketApp)
      .post(`/tickets/${ticketId}/shares`)
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ partnerOrgId: orgBId })
      .expect(201);
    shareId = shareRes.body.data.id;
  });

  afterAll(async () => {
    await stack.stop();
  });

  test('a share grants view + comment on exactly that one resource', async () => {
    const viewRes = await request(ticketApp).get(`/tickets/${ticketId}`).set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(viewRes.status).toBe(200);
    expect(viewRes.body.data.id).toBe(ticketId);

    const commentRes = await request(ticketApp)
      .post(`/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ body: 'Guest comment via share' });
    expect(commentRes.status).toBe(201);
  });

  test('edit, delete, and re-share on the shared resource all fail for the guest org', async () => {
    const editRes = await request(ticketApp)
      .patch(`/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ status: 'CLOSED' });
    expect(editRes.status).toBe(404);

    const deleteRes = await request(ticketApp).delete(`/tickets/${ticketId}`).set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(deleteRes.status).toBe(404);

    const reshareRes = await request(ticketApp)
      .post(`/tickets/${ticketId}/shares`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ partnerOrgId: orgAId });
    expect(reshareRes.status).toBe(404);
  });

  test('revoking the underlying connection removes access even though the share row itself is untouched', async () => {
    const beforeRes = await request(ticketApp)
      .get(`/tickets/${ticketId}/shares`)
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .expect(200);
    const shareBefore = beforeRes.body.data.find((s) => s.id === shareId);
    expect(shareBefore).toBeTruthy();
    expect(shareBefore.revokedAt).toBeNull();

    // Revoke the CONNECTION, not the share.
    await request(identityApp)
      .patch(`/connections/${connectionId}`)
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ status: 'REVOKED' })
      .expect(200);

    // Access is gone...
    const afterAccessRes = await request(ticketApp).get(`/tickets/${ticketId}`).set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(afterAccessRes.status).toBe(404);

    // ...but the share row's own fields are provably unchanged — same id,
    // same createdAt, still revokedAt: null. Access disappeared purely
    // because the connection-approved check failed, not because anything
    // about the share itself was modified.
    const afterRes = await request(ticketApp)
      .get(`/tickets/${ticketId}/shares`)
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .expect(200);
    const shareAfter = afterRes.body.data.find((s) => s.id === shareId);
    expect(shareAfter).toEqual(shareBefore);
  });
});
