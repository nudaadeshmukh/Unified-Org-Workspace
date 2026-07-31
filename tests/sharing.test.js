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
describe('sharing.test.js — tickets', () => {
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

/**
 * Same fixture pattern and same assertions as the ticket-sharing block
 * above (two fresh orgs, a real APPROVED connection, a real share), applied
 * to pr-service — closes the gap flagged after Phase 8's live-browser-only
 * verification of cross-org PR guest access (this exact scenario had never
 * been pinned by an automated test, only proven manually in Chrome).
 *
 * One deliberate deviation from the ticket block's structure: pr-service has
 * no comment primitive at all (per api_reference.md, PRs have no
 * POST/GET .../comments route the way tickets do) — a PR guest's positive
 * permission is view-only (GET /prs/:id, and by the same access check
 * GET /prs/:id/versions), not "view + comment". Submitting a review is
 * NOT part of a guest's permission set either — api_reference.md's
 * POST /prs/:id/reviews is "REV assigned to this PR, or OA", so it's
 * asserted alongside edit/delete/re-share as something that must fail for
 * a plain guest, not asserted as a positive capability the way ticket
 * commenting is.
 */
describe('sharing.test.js — pull requests', () => {
  let stack;
  let identityApp;
  let prApp;

  let orgAId;
  let orgBId;
  let orgAAdminToken;
  let orgBAdminToken;
  let prId;
  let shareId;
  let connectionId;

  beforeAll(async () => {
    stack = await startStack({ identity: true, pr: true, audit: true });
    identityApp = require('../packages/identity-service/src/server');
    prApp = require('../packages/pr-service/src/server');

    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const orgARegister = await request(identityApp)
      .post('/auth/register')
      .send({
        email: `pr-sharing-a-${unique}@example.com`,
        password: 'TestPassword123!',
        name: 'Org A Admin',
        orgName: `PR Sharing Test Org A ${unique}`,
      })
      .expect(201);
    orgAAdminToken = orgARegister.body.data.accessToken;
    orgAId = orgARegister.body.data.memberships[0].orgId;

    const orgBRegister = await request(identityApp)
      .post('/auth/register')
      .send({
        email: `pr-sharing-b-${unique}@example.com`,
        password: 'TestPassword123!',
        name: 'Org B Admin',
        orgName: `PR Sharing Test Org B ${unique}`,
      })
      .expect(201);
    orgBAdminToken = orgBRegister.body.data.accessToken;
    orgBId = orgBRegister.body.data.memberships[0].orgId;

    // Approve a connection Org A -> Org B before any share can be created
    // (pr-service's createShare requires an APPROVED connection, same rule
    // as ticket-service's).
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

    const prRes = await request(prApp)
      .post('/prs')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ title: 'Shared with Org B', description: 'PR sharing test fixture' })
      .expect(201);
    prId = prRes.body.data.id;

    const shareRes = await request(prApp)
      .post(`/prs/${prId}/shares`)
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .send({ partnerOrgId: orgBId })
      .expect(201);
    shareId = shareRes.body.data.id;
  });

  afterAll(async () => {
    await stack.stop();
  });

  test('a share grants view on exactly that one resource', async () => {
    const viewRes = await request(prApp).get(`/prs/${prId}`).set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(viewRes.status).toBe(200);
    expect(viewRes.body.data.id).toBe(prId);

    const versionsRes = await request(prApp)
      .get(`/prs/${prId}/versions`)
      .set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(versionsRes.status).toBe(200);
  });

  test('edit, delete, review, add-reviewer, and re-share on the shared resource all fail for the guest org', async () => {
    const editRes = await request(prApp)
      .patch(`/prs/${prId}`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ title: 'Hijacked title' });
    expect(editRes.status).toBe(404);

    const deleteRes = await request(prApp).delete(`/prs/${prId}`).set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(deleteRes.status).toBe(404);

    // Guest access alone is not review-assignment access — "REV assigned to
    // this PR, or OA" (api_reference.md), never just any caller who can view
    // the PR via a share.
    const reviewRes = await request(prApp)
      .post(`/prs/${prId}/reviews`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ status: 'APPROVED' });
    expect(reviewRes.status).toBe(404);

    // userId just needs to be a syntactically valid UUID — assertOwnPR's
    // org-ownership check 404s before the body's userId is ever looked up.
    const addReviewerRes = await request(prApp)
      .post(`/prs/${prId}/reviewers`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ userId: '00000000-0000-0000-0000-000000000000' });
    expect(addReviewerRes.status).toBe(404);

    const reshareRes = await request(prApp)
      .post(`/prs/${prId}/shares`)
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ partnerOrgId: orgAId });
    expect(reshareRes.status).toBe(404);
  });

  test('revoking the underlying connection removes access even though the share row itself is untouched', async () => {
    const beforeRes = await request(prApp)
      .get(`/prs/${prId}/shares`)
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
    const afterAccessRes = await request(prApp).get(`/prs/${prId}`).set('Authorization', `Bearer ${orgBAdminToken}`);
    expect(afterAccessRes.status).toBe(404);

    // ...but the share row's own fields are provably unchanged — same id,
    // same createdAt, still revokedAt: null. Access disappeared purely
    // because the connection-approved check failed, not because anything
    // about the share itself was modified.
    const afterRes = await request(prApp)
      .get(`/prs/${prId}/shares`)
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .expect(200);
    const shareAfter = afterRes.body.data.find((s) => s.id === shareId);
    expect(shareAfter).toEqual(shareBefore);
  });
});
