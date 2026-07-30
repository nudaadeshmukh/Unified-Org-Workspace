module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testTimeout: 30000,
  // Runs before the test framework loads, and before any test file requires
  // a service's server.js — redirects every service's DATABASE_URL at the
  // isolated froncort_test database. See tests/helpers/testEnv.js.
  setupFiles: ['<rootDir>/tests/helpers/testEnv.js'],
};
