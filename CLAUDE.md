# CLAUDE.md

This file is persistent project context. Read it before every task in this repo. It does not change between phases — `implementation_guide.md` and `api_reference.md` carry the phase-specific detail; this file carries the rules that never change.

## Project

Unified Org Workspace for Froncort.AI — a multi-tenant SaaS combining a Support Hub (ticketing) and a Review & Audit Console (PR workflow) under one shared identity layer. Assignment context: security and correctness (tenant isolation, BOLA, audit integrity, RBAC, session/token lifecycle) are what's being evaluated — favor getting these right over feature breadth or visual polish.

## Non-negotiable rules — never violate these, even if a phase prompt doesn't repeat them

1. **Every database query that touches tenant data must be scoped by `orgId` derived from the verified JWT (`req.user.active_org_id`) — never from a URL param, query string, or request body.** This is the single most important rule in this codebase. If you're writing a query against `Ticket`, `PullRequest`, `Comment`, `Attachment`, or any table with an `orgId`/`ticketId`/`prId` column, the org check comes first, unconditionally.
2. **Resource-not-found and resource-not-yours-to-see both return 404, never 403.** Don't reveal that a resource exists to a caller who has no relationship to it.
3. **Cross-org access always goes through the share-check chain, in order:** owns it directly → OR has a non-revoked share row for this exact resource ID → AND the underlying `OrgConnection` is still `APPROVED`. All four conditions matter; a share row alone is not sufficient if the connection was later revoked.
4. **The audit log is append-only at the database permission level**, not just by convention in application code. The runtime connection for audit-service uses the restricted `audit_writer` role (INSERT+SELECT only). Never add UPDATE/DELETE capability to this table or role, even for "cleanup" or "fixing a typo" reasons.
5. **Never put a JWT or refresh token in localStorage or sessionStorage.** Access tokens live in memory (React state/context) on the frontend. Refresh tokens live server-side in Redis, referenced only by an `httpOnly`, `Secure` cookie.
6. **Access tokens are signed with RS256.** Only identity-service ever touches the private key. ticket-service, pr-service, and audit-service only ever verify using the public key — never call identity-service synchronously just to check a token.
7. **Service-to-service calls use the shared internal API key header** (`packages/shared/middleware/internalAuth.js`), never the end-user's JWT forwarded onward.
8. **No route handler talks to Prisma directly.** Route → business logic function → Prisma client. This separation is graded; don't collapse it for speed.
9. **Every mutation that's a "reportable action" per the spec calls `auditClient.log(...)` before returning success to the caller.** If you add a new mutation and you're unsure whether it needs an audit entry, check `api_reference.md`'s audit-actions list before deciding it doesn't.
10. **Passwords are bcrypt-hashed (cost 10–12), never logged, never included in any API response, ever** — including nested in a `user` object returned from an unrelated endpoint.
11. **Do not invent new API routes, response shapes, or role names that aren't in `reference/api_reference.md`.** If a phase seems to need one that isn't documented, stop and ask rather than improvising — this project is being graded partly on architecture discipline, and undocumented endpoints break that.

## Architecture

True microservices, npm-workspaces monorepo, one Postgres instance (4 schemas: `identity`, `tickets`, `prs`, `audit`), one Redis instance.

```
froncort-workspace/
├── packages/
│   ├── shared/              # @froncort/shared — jwt.js, orgScope.js, auditClient.js, middleware/
│   ├── identity-service/    # auth, users, orgs, memberships, connections
│   ├── ticket-service/      # Support Hub
│   ├── pr-service/          # Review Console
│   └── audit-service/       # unified audit log, notifications, AI digest scheduler
├── frontend/
│   ├── packages/ui/         # shared component library
│   ├── apps/support-hub/    # Next.js — Dashboard 1
│   └── apps/review-console/ # Next.js — Dashboard 2
├── docs/
├── scripts/
└── docker-compose.yml
```

Within every service: `src/routes/` (HTTP + zod validation only) → `src/services/` or `src/lib/` (business logic) → Prisma client (data access). Same pattern in all 4 services, no exceptions.

## Tech stack

- Backend: Node.js + Express, one process per service
- Database: PostgreSQL via Prisma — each service has its own `schema.prisma`, own migration history, connects via a schema-scoped URL (`?schema=identity`, etc.)
- Cache/session: Redis (refresh tokens, rate-limit counters)
- Frontend: Next.js + React + Tailwind CSS
- Auth: JWT (RS256) + Redis-backed refresh tokens
- AI: Groq API, Llama 3.3 70B, OpenAI-compatible client
- Validation: zod on every route body
- Security middleware: helmet, cors (explicit allowlist), express-rate-limit
- Tests: Jest + Supertest

## Conventions

- IDs: Prisma-generated UUIDs (`@default(uuid())`), client-side, never DB defaults.
- Enums live in `schema.prisma`, values in SCREAMING_SNAKE_CASE (`IN_PROGRESS`, `CROSS_ORG_GUEST` is NOT a stored value — see rule below).
- **`CROSS_ORG_GUEST` is not a stored `OrgRole`.** A cross-org guest is a normal member of their own home org accessing one shared resource via a `TicketShare`/`PRShare` row. Don't add it to the `OrgRole` enum or check for it as a role — check for share access instead (`requireShareAccess` middleware, not `requireRole`).
- API responses: `{ data: ... }` on success, `{ error: { message, code } }` on failure. Consistent across all 4 services.
- Environment variables: read from `.env`, documented in `.env.example` — if you add a new one, add it to `.env.example` too, in the same phase's commit.
- Every new Prisma model needs an `@@index` on any column a query will filter by (`orgId`, at minimum).

## Local Development Environment

**Database:** use the developer's existing local PostgreSQL installation (`localhost:5432`). **Do NOT create a PostgreSQL Docker container** — generate all Prisma connection strings against the local server, not a containerized one. This applies to local dev only; production (Railway) still uses a managed Postgres instance as already specified in Phase 9.

**Redis:** Docker is used **only** for Redis. `docker-compose.yml` at the repo root contains a Redis service and nothing else — no Postgres service in it.
```env
REDIS_URL=redis://localhost:6379
```
Expected workflow: `docker compose up -d` starts Redis only. Postgres is assumed already running locally and is never started by this command.

## Reliability Rules

- Never guess the contents of a file — read it first.
- Never overwrite working code unless explicitly requested.
- Make the smallest possible change to accomplish each task.
- If a command fails, diagnose and fix the issue before continuing.
- Before ending a phase, verify the application builds successfully.
- If a required dependency or tool is missing, tell the user exactly what to install instead of assuming it exists.

## Commands

- `npm run dev` (root) — starts all 4 services concurrently
- `npm run prisma:migrate` (root) — runs migrate dev for all 4 services
- `npx prisma db seed` (per service directory) — seeds that service's data
- `npm test` (per service, or root for all) — runs that service's Jest suite
- `docker compose up -d` — starts Redis (only). Postgres must already be running locally — see Local Development Environment above.

## Reference documents (all in `reference/`, this file lives at repo root)

- `reference/implementation_guide.md` — the phase-by-phase blueprint. Build exactly what the current phase specifies, not ahead of it and not behind it. If a phase needs something an earlier phase was supposed to deliver and didn't, flag it — don't silently build around the gap.
- `reference/api_reference.md` — the exact contract for every endpoint: method, path, allowed roles, request/response shape. Match it precisely; don't improvise variations.
- `reference/frontend_reference.md` — the frontend design system: components, layout, styling conventions. Authoritative for Phases 7–8 (and any earlier phase that touches the frontend shell in Phase 1). Read it before writing any frontend code, not just before Phase 7.
- `reference/FullStack Assignment.md` — the original assignment brief. If `implementation_guide.md`/`api_reference.md` ever seem ambiguous or silent on something, this is the tie-breaker; the two guides above take priority when they're clear, since they already resolved most of this brief's ambiguity into concrete decisions.

## How to work within a phase

- After Phase 1, **never regenerate the project structure.** Only touch the files a phase's scope requires. If achieving a phase's goal seems to require restructuring something built in an earlier phase, stop and explain why before doing it.
- If the user's prompt for a phase conflicts with `reference/implementation_guide.md`, the user's explicit instruction in that prompt wins for that phase — but note the deviation in your response so it's visible, don't silently absorb it.
- **At the start of every session**, read `docs/project-progress.md` first, before reading anything else, to pick up where the last phase left off — don't ask the user to re-explain what's already built.
- **At the end of every phase**, update `docs/project-progress.md` with: Completed features, Files modified, Remaining work, Known issues/TODOs — for that phase specifically, appended to the running log, not overwriting earlier phases' entries. Do this as the last step of the phase, after the code itself is working, not before.
