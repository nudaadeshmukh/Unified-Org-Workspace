const path = require('path');
// Next.js only auto-discovers .env* files inside the app's own directory;
// this monorepo's single source of truth is the repo-root .env (same file
// every backend service loads via dotenv). Load it explicitly here rather
// than duplicating a second .env.local per frontend app — same pattern as
// support-hub's next.config.js.
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@froncort/ui'],
  env: {
    NEXT_PUBLIC_IDENTITY_API_URL: process.env.NEXT_PUBLIC_IDENTITY_API_URL,
    NEXT_PUBLIC_TICKET_API_URL: process.env.NEXT_PUBLIC_TICKET_API_URL,
    NEXT_PUBLIC_PR_API_URL: process.env.NEXT_PUBLIC_PR_API_URL,
    NEXT_PUBLIC_AUDIT_API_URL: process.env.NEXT_PUBLIC_AUDIT_API_URL,
  },
};

module.exports = nextConfig;
