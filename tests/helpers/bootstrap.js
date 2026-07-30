// Shared cross-service test bootstrap. Each service's server.js exports its
// Express `app` without auto-binding the fixed port (see the
// `require.main === module` guard added to each — Phase 6), so tests start
// exactly the services they need on ephemeral ports and wire the
// inter-service URL env vars (IDENTITY_SERVICE_URL, TICKET_SERVICE_URL,
// PR_SERVICE_URL, AUDIT_SERVICE_URL) between them — identical in shape to
// how the real deployed services find each other, just on random ports
// instead of the locked 4001-4004.

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0);
    server.on('listening', () => resolve(server));
    server.on('error', reject);
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

/**
 * @param {{identity?: boolean, ticket?: boolean, pr?: boolean, audit?: boolean}} which
 * @returns {Promise<{servers: object[], stop: () => Promise<void>}>}
 */
async function startStack(which = {}) {
  const servers = [];
  const prismaClients = [];
  let redisClient = null;

  // identity-service needs Redis connected — its own server.js only does
  // this inside the require.main guard now, so tests must do it themselves.
  if (which.identity || which.ticket || which.pr || which.audit) {
    // Every other service calls out to identity-service (connection checks,
    // org-role checks, org-members enumeration), so it's started first
    // whenever anything else is requested, even if the test didn't ask for
    // it explicitly by name.
    const redisLib = require('../../packages/identity-service/src/lib/redis');
    redisClient = await redisLib.connectRedis();

    const identityApp = require('../../packages/identity-service/src/server');
    const identityServer = await listen(identityApp);
    process.env.IDENTITY_SERVICE_URL = `http://localhost:${identityServer.address().port}`;
    servers.push(identityServer);
    prismaClients.push(require('../../packages/identity-service/src/lib/prisma'));
  }

  if (which.ticket) {
    const ticketApp = require('../../packages/ticket-service/src/server');
    const ticketServer = await listen(ticketApp);
    process.env.TICKET_SERVICE_URL = `http://localhost:${ticketServer.address().port}`;
    servers.push(ticketServer);
    prismaClients.push(require('../../packages/ticket-service/src/lib/prisma'));
  }

  if (which.pr) {
    const prApp = require('../../packages/pr-service/src/server');
    const prServer = await listen(prApp);
    process.env.PR_SERVICE_URL = `http://localhost:${prServer.address().port}`;
    servers.push(prServer);
    prismaClients.push(require('../../packages/pr-service/src/lib/prisma'));
  }

  if (which.audit) {
    const auditApp = require('../../packages/audit-service/src/server');
    const auditServer = await listen(auditApp);
    process.env.AUDIT_SERVICE_URL = `http://localhost:${auditServer.address().port}`;
    servers.push(auditServer);
    prismaClients.push(require('../../packages/audit-service/src/lib/prisma'));
  }

  return {
    servers,
    // Explicit teardown, not relying on `--forceExit` to paper over leaked
    // handles — each started service's own Prisma client (and identity's
    // Redis connection) is disconnected, on top of closing the HTTP servers.
    async stop() {
      await Promise.all(servers.map(close));
      await Promise.all(prismaClients.map((client) => client.$disconnect()));
      if (redisClient) {
        await redisClient.quit();
      }
    },
  };
}

module.exports = { startStack };
