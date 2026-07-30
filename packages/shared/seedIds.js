// Fixed, deterministic IDs shared across every service's seed script, so
// cross-service seed data (ticket-service's seeded tickets referencing
// identity-service's seeded users/orgs, pr-service doing the same in
// Phase 4) can reference each other reliably without a runtime cross-schema
// dependency. Seed-time convenience only — application/runtime code must
// always trust the verified JWT for identity (CLAUDE.md rule #1), never one
// of these hardcoded IDs.

module.exports = {
  ORG_ALPHA_ID: '00000000-0000-0000-0000-0000000a1fa0',
  ORG_BETA_ID: '00000000-0000-0000-0000-0000000be7a0',
  CONNECTION_ALPHA_BETA_ID: '00000000-0000-0000-0000-00000000c001',

  USER_ALPHA_ADMIN_ID: '00000001-0000-0000-0000-000000000001',
  USER_ALPHA_AGENT_ID: '00000001-0000-0000-0000-000000000002',
  USER_ALPHA_REVIEWER_ID: '00000001-0000-0000-0000-000000000003',
  USER_BETA_ADMIN_ID: '00000001-0000-0000-0000-000000000004',
  USER_BETA_AGENT_ID: '00000001-0000-0000-0000-000000000005',
  USER_BETA_REVIEWER_ID: '00000001-0000-0000-0000-000000000006',
  USER_PLATFORM_ADMIN_ID: '00000001-0000-0000-0000-000000000007',
};
