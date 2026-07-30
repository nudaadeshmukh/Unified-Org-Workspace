#!/usr/bin/env node
/**
 * Provisions the isolated `froncort_test` database used by tests/ (Phase 6).
 * Idempotent — safe to re-run. Never touches the seeded `froncort` dev
 * database; every URL derived here swaps the db name only, keeping the same
 * host/port/user/password/schema as the real .env's owner connections.
 *
 * Usage: `npm run test:setup` (root) — see package.json.
 */
const path = require('path');
const { execFileSync } = require('child_process');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function toTestDbUrl(url) {
  // postgresql://user:pass@host:port/DBNAME?schema=xyz -> .../froncort_test?schema=xyz
  return url.replace(/\/([^/?]+)(\?|$)/, '/froncort_test$2');
}

const IDENTITY_TEST_URL = toTestDbUrl(process.env.IDENTITY_DATABASE_URL);
const TICKETS_TEST_URL = toTestDbUrl(process.env.TICKETS_DATABASE_URL);
const PRS_TEST_URL = toTestDbUrl(process.env.PRS_DATABASE_URL);
const AUDIT_TEST_URL = toTestDbUrl(process.env.AUDIT_DATABASE_URL);
const AUDIT_RUNTIME_TEST_URL = toTestDbUrl(process.env.AUDIT_RUNTIME_DATABASE_URL);

// Parse host/port/user/password from the owner URL (identity's, arbitrarily
// — all 4 share the same Postgres instance/credentials) for the psql calls
// below, which need a plain `-h -p -U` invocation rather than a single URL.
const parsed = new URL(process.env.IDENTITY_DATABASE_URL);
const PGHOST = parsed.hostname;
const PGPORT = parsed.port || '5432';
const PGUSER = decodeURIComponent(parsed.username);
const PGPASSWORD = decodeURIComponent(parsed.password);

const psqlEnv = { ...process.env, PGPASSWORD };

function psql(database, args) {
  return execFileSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-d', database, ...args], {
    env: psqlEnv,
    stdio: 'inherit',
  });
}

console.log('Creating froncort_test database (if it does not already exist)...');
try {
  execFileSync(
    'psql',
    ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-d', 'postgres', '-tc', "SELECT 1 FROM pg_database WHERE datname = 'froncort_test'"],
    { env: psqlEnv }
  ).toString().includes('1')
    ? console.log('  already exists.')
    : psql('postgres', ['-c', 'CREATE DATABASE froncort_test']);
} catch {
  psql('postgres', ['-c', 'CREATE DATABASE froncort_test']);
}

function migrateDeploy(serviceDir, testUrl, envVarName) {
  console.log(`Migrating ${serviceDir} into froncort_test...`);
  execFileSync('npx', ['prisma', 'migrate', 'deploy', '--schema=prisma/schema.prisma'], {
    cwd: path.resolve(__dirname, `../packages/${serviceDir}`),
    env: { ...process.env, [envVarName]: testUrl },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

migrateDeploy('identity-service', IDENTITY_TEST_URL, 'IDENTITY_DATABASE_URL');
migrateDeploy('ticket-service', TICKETS_TEST_URL, 'TICKETS_DATABASE_URL');
migrateDeploy('pr-service', PRS_TEST_URL, 'PRS_DATABASE_URL');
migrateDeploy('audit-service', AUDIT_TEST_URL, 'AUDIT_DATABASE_URL');

// Re-apply the exact same append-only.sql against froncort_test's audit
// schema — audit_writer is a cluster-wide role (already exists from Phase
// 5), but GRANT/REVOKE is per-database, so froncort_test needs its own
// grant even though the role itself isn't being recreated.
console.log('Applying append-only.sql grants to froncort_test...');
psql('froncort_test', ['-f', path.resolve(__dirname, '../packages/audit-service/prisma/append-only.sql')]);

console.log('\nfroncort_test is ready. Test env URLs (for reference — tests/helpers/testEnv.js derives these automatically):');
console.log(`  IDENTITY_DATABASE_URL=${IDENTITY_TEST_URL}`);
console.log(`  TICKETS_DATABASE_URL=${TICKETS_TEST_URL}`);
console.log(`  PRS_DATABASE_URL=${PRS_TEST_URL}`);
console.log(`  AUDIT_DATABASE_URL=${AUDIT_TEST_URL}`);
console.log(`  AUDIT_RUNTIME_DATABASE_URL=${AUDIT_RUNTIME_TEST_URL}`);
