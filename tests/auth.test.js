const request = require('supertest');
const { startStack } = require('./helpers/bootstrap');

/**
 * Covers identity-service's full session lifecycle per implementation_guide.md
 * Phase 6: login -> refresh (rotation) -> org-switch -> logout-everywhere ->
 * reused refresh token rejected and revokes the whole session. Split into two
 * scenarios (each with its own freshly-registered user) rather than one long
 * chain on a single session — logout-everywhere and the reuse-detection check
 * are both independently destructive to a session, so chaining them on the
 * same live session would make the second check meaningless (a refresh
 * failing after logout doesn't prove reuse-detection specifically fired).
 * Matches Phase 2's original manual proof, which tested both as separate
 * proof points for the same reason.
 */
describe('auth.test.js', () => {
  let stack;
  let app;

  beforeAll(async () => {
    stack = await startStack({ identity: true });
    app = require('../packages/identity-service/src/server');
  });

  afterAll(async () => {
    await stack.stop();
  });

  function freshUser(tag) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return {
      email: `auth-${tag}-${unique}@example.com`,
      password: 'TestPassword123!',
      name: `Auth Test ${tag}`,
      orgName: `Auth Test Org ${tag}`,
    };
  }

  function extractCookie(res) {
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeTruthy();
    return setCookie[0].split(';')[0];
  }

  test('refresh rotates the cookie; org-switch works with the new token; reusing an already-rotated cookie is rejected and revokes the whole session, including the legitimate successor', async () => {
    const user = freshUser('reuse');
    const registerRes = await request(app).post('/auth/register').send(user).expect(201);
    const orgId = registerRes.body.data.memberships[0].orgId;

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    const loginCookie = extractCookie(loginRes);
    expect(loginRes.body.data.accessToken).toEqual(expect.any(String));

    // Refresh #1 — rotates the cookie. The response's Set-Cookie is a NEW
    // token; loginCookie is now a used, superseded token.
    const refresh1Res = await request(app).post('/auth/refresh').set('Cookie', loginCookie).expect(200);
    const cookieAfterRefresh1 = extractCookie(refresh1Res);
    expect(cookieAfterRefresh1).not.toEqual(loginCookie);

    // org-switch with the freshly-rotated access token.
    const switchRes = await request(app)
      .post('/auth/switch-org')
      .set('Authorization', `Bearer ${refresh1Res.body.data.accessToken}`)
      .send({ orgId })
      .expect(200);
    expect(switchRes.body.data.accessToken).toEqual(expect.any(String));

    // Refresh #2 — the legitimate next rotation, using the cookie issued by
    // refresh #1. This is the "legitimately-rotated successor" that reuse
    // detection must also kill once the OLDER cookie gets replayed below.
    const refresh2Res = await request(app).post('/auth/refresh').set('Cookie', cookieAfterRefresh1).expect(200);
    const cookieAfterRefresh2 = extractCookie(refresh2Res);

    // Replay the cookie from AFTER refresh #1 — already superseded by
    // refresh #2 above. This must be rejected as reuse of a rotated token.
    const reuseRes = await request(app).post('/auth/refresh').set('Cookie', cookieAfterRefresh1);
    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.error.code).toBe('SESSION_REVOKED');

    // The legitimate, never-reused successor (cookieAfterRefresh2) must ALSO
    // be dead now — reuse detection wipes the WHOLE session, not just the
    // specific token that got replayed.
    const successorRes = await request(app).post('/auth/refresh').set('Cookie', cookieAfterRefresh2);
    expect(successorRes.status).toBe(401);
    expect(successorRes.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('logout-everywhere revokes the session; a refresh attempt afterward is rejected', async () => {
    const user = freshUser('logout');
    await request(app).post('/auth/register').send(user).expect(201);

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    const cookie = extractCookie(loginRes);
    const accessToken = loginRes.body.data.accessToken;

    await request(app).delete('/auth/session').set('Authorization', `Bearer ${accessToken}`).set('Cookie', cookie).expect(200);

    const refreshAfterLogout = await request(app).post('/auth/refresh').set('Cookie', cookie);
    expect(refreshAfterLogout.status).toBe(401);
  });
});
