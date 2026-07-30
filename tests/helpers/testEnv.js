// Jest `setupFiles` entry — runs before every test file's own code, and
// before that file requires any service's server.js. Redirects every
// service's DATABASE_URL at the isolated `froncort_test` database (never
// the seeded `froncort` dev database used for manual verification
// throughout this project). Each service's own server.js still calls
// `require('dotenv').config(...)` when required, but dotenv's default
// `override: false` means it will NOT clobber the test URLs set here — it
// only fills in whatever else isn't already set (JWT keys, INTERNAL_API_KEY,
// GROQ_API_KEY, etc.), which is exactly the behavior this depends on.
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

function toTestDbUrl(url) {
  return url.replace(/\/([^/?]+)(\?|$)/, '/froncort_test$2');
}

process.env.IDENTITY_DATABASE_URL = toTestDbUrl(process.env.IDENTITY_DATABASE_URL);
process.env.TICKETS_DATABASE_URL = toTestDbUrl(process.env.TICKETS_DATABASE_URL);
process.env.PRS_DATABASE_URL = toTestDbUrl(process.env.PRS_DATABASE_URL);
process.env.AUDIT_DATABASE_URL = toTestDbUrl(process.env.AUDIT_DATABASE_URL);
process.env.AUDIT_RUNTIME_DATABASE_URL = toTestDbUrl(process.env.AUDIT_RUNTIME_DATABASE_URL);
