module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testTimeout: 30000,
  // .claude/worktrees/* can contain full checkouts of this repo (created by
  // agent isolation tooling) — without this, Jest's Haste module map finds
  // two package.json files both named e.g. @froncort/shared and refuses to
  // resolve either. modulePathIgnorePatterns alone isn't enough here; Jest's
  // Haste map walks haste-scanned roots independent of module resolution.
  modulePathIgnorePatterns: ['<rootDir>/.claude/'],
  watchPathIgnorePatterns: ['<rootDir>/.claude/'],
  // Runs before the test framework loads, and before any test file requires
  // a service's server.js — redirects every service's DATABASE_URL at the
  // isolated froncort_test database. See tests/helpers/testEnv.js.
  setupFiles: ['<rootDir>/tests/helpers/testEnv.js'],
};
