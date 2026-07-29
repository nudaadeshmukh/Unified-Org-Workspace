# Project Progress Log

**Purpose:** this file is the running memory of the project across Claude Code sessions. Read it first at the start of any new session, before reading anything else, to know exactly what already exists. Update it last, at the end of every phase, after the phase's code is actually working.

**Rules for updating this file:**
- Append a new dated entry per phase. Never edit or delete a previous phase's entry, even if something built in that phase later gets changed — add a note in the *current* phase's entry instead ("Phase 2's refresh rotation logic was adjusted here because...").
- Be concrete: file paths, not vague descriptions. "Added `POST /tickets/:id/shares` in `packages/ticket-service/src/routes/tickets.routes.js`" — not "added sharing."
- "Known issues/TODOs" is not optional even if a phase felt complete — note anything deferred, simplified, or assumed, however small. This is what prevents small gaps from silently compounding across a multi-day build.

---

## Phase 0 — Planning (reference only, no code)

Architecture, database schema, API contracts, and all 9 phases were fully designed and locked in before any code was written. See `reference/implementation_guide.md`, `reference/api_reference.md`, `reference/frontend_reference.md`, and `CLAUDE.md` for the complete specification this build follows.

---

## Phase 1 — Project Foundation

**Status:** complete (2026-07-29)

**Completed features:**
- npm-workspaces monorepo wired at root (`package.json` → `workspaces: ["packages/*", "frontend/packages/*", "frontend/apps/*"]`), with `dev`, `prisma:generate`, `prisma:migrate` scripts fanning out to all 4 services (+ both frontend apps for `dev`).
- `docker-compose.yml` — Redis only, per `CLAUDE.md`.
- `packages/shared`: stub signatures (throw "not implemented" pointing at the phase that fills them in) for `jwt.js` (sign/verify), `orgScope.js` (ownsResource/checkShareAccess), `auditClient.js` (log), `middleware/{authenticate,requireRole,internalAuth}.js`.
- All 4 backend services (`identity-service`, `ticket-service`, `pr-service`, `audit-service`): bare Express app (`helmet`, `cors`, `morgan`, `express.json()`), one `/health` route each, listening on the locked ports (4001–4004), loading env from the root `.env` via `dotenv`.
- All 4 Prisma schemas written in full and migrated against local Postgres (`froncort` DB, one schema each — `identity`, `tickets`, `prs`, `audit`):
  - `packages/identity-service/prisma/schema.prisma` — `User`, `Organization`, `OrgMembership` (enum `OrgRole`), `OrgConnection` (enum `ConnectionStatus`).
  - `packages/ticket-service/prisma/schema.prisma` — `Ticket`, `Comment`, `Attachment`, `TicketShare`, `FeatureFlag`.
  - `packages/pr-service/prisma/schema.prisma` — `PullRequest`, `PRVersion`, `PRReviewer`, `PRReview`, `PRShare`.
  - `packages/audit-service/prisma/schema.prisma` — `AuditLog` (enum `AuditAction`, all 17 actions from `api_reference.md`), `Notification`.
  - No cross-schema FKs by design (each service only knows its own schema) — `orgId`/`userId`/etc. are opaque UUIDs, trust comes from the verified JWT, not Postgres.
- `frontend/packages/ui`: placeholder `Button.jsx` / `Card.jsx` + `index.js` barrel export.
- `frontend/apps/support-hub` and `frontend/apps/review-console`: Next.js 15 (App Router) + Tailwind, wired to the color/radius tokens from `reference/frontend_reference.md`, a disabled login-form shell at `/` and an empty `/dashboard` shell, ports 3000/3001 per the locked ports table.
- `npm install && npm run dev` verified starting all 4 backend services + both frontend apps cleanly; `npm run prisma:migrate` verified against local Postgres; all 4 `/health` endpoints and both frontend `/` routes smoke-tested with curl (200s).

**Files modified (beyond the new Phase 1 skeleton itself):**
- `docs/project-progress.md` — **moved here from `reference/project-progress.md`.** It had been committed at the wrong path since the initial "Base setup" commit; `CLAUDE.md` and `implementation_guide.md` both always said `docs/project-progress.md`, and the assignment brief lists `/docs` as a graded deliverable, so `reference/` (meant to hold only the 4 static planning docs) was the wrong home for a living per-phase log. `git mv`'d, not copied.
- `.env.example` — **renamed from `env.example`** (missing leading dot) to match every reference to it in `CLAUDE.md` and `implementation_guide.md`.
- Local `.env` (gitignored, not committed) — percent-encoded the `@` in the Postgres password inside all 4 `DATABASE_URL`s (`Nudaad@2102` → `Nudaad%402102`). Node's/Prisma's WHATWG-compliant URL parsing actually resolved the original form correctly, but Prisma's own docs mandate percent-encoding special characters, and Phase 5's `audit_writer` role setup will likely use raw `psql`/`pg` calls that may not share the same forgiving parser — hardened now rather than risk it later.
- Removed stray top-level `backend/` directory (only contained a duplicated, gitignored `backend/keys/backend/keys/*.pem` pair left over from an earlier misfired key-gen run — already superseded by the base64 keys in `.env`; no real code lost). `CLAUDE.md`'s locked structure has no top-level `backend/` — services live under `packages/`.
- Deleted a 294MB stale root `node_modules` that didn't match `package.json`/`package-lock.json` (contained `recharts`, `embla-carousel`, `cmdk`, `vaul`, `sonner` — leftovers from an unrelated earlier scaffold in this same folder) before running a clean `npm install`.

**Remaining work:**
- Everything functional: real auth, RBAC, ticket/PR CRUD, sharing, audit logging, AI digest, and all real frontend screens — Phases 2 through 8, in order.

**Known issues / TODOs:**
- **Prisma pinned to `^6.19.3`, not `7.9.1`.** The root `package.json`/service `package.json`s originally had `prisma`/`@prisma/client` at `^7.9.1` (pre-existing before this phase). Prisma 7 removed the classic `datasource { url = env(...) }` pattern for Migrate — it now requires a `prisma.config.ts` + driver-adapter (`@prisma/adapter-pg`) setup per project. `CLAUDE.md`'s design (schema-scoped connection-string URLs, and audit-service's two-connection-string owner/`audit_writer` split) was written entirely around the classic single-URL model, and adopting Prisma 7's adapter pattern properly would ripple into how every service constructs its `PrismaClient` in every later phase. Pinned to the last 6.x (`6.19.3`) instead, which keeps the schema/env-var model exactly as documented. Revisit only if a future phase has a specific reason to need Prisma 7.
- Each service's Prisma Client is generated to a local `src/generated/prisma-client` (custom `output` path) rather than the default `node_modules/@prisma/client`, to avoid the 4 schemas' generated clients colliding under npm workspaces' hoisted `node_modules`.
- `dotenv-cli` is used for `prisma:generate`/`prisma:migrate` scripts (`dotenv -e ../../.env -- prisma ...`) since Prisma's CLI doesn't automatically discover the repo-root `.env` from a workspace package's own directory.
- Windows-only dev quirk: two `next dev` processes starting for the first time both try to write the shared global `~/AppData/Roaming/nextjs-nodejs/Config/config.json` telemetry file and race (`EPERM`). Fixed by running `next telemetry disable` once; if telemetry is ever re-enabled, the race could reappear on a from-scratch machine.
- Windows-only dev quirk: stopping the `npm run dev` (`concurrently`) parent process does not reliably kill the 6 child processes it spawned — they can keep holding ports 4001–4004/3000–3001. If `npm run dev` ever needs restarting, check for and kill orphaned processes on those ports first (`netstat -ano | grep LISTENING`, then `taskkill //PID <pid> //F`).
- CORS is wide open (`cors()` with no allowlist) in all 4 services — intentional per Phase 1 scope ("not configured with real allowlists yet"); locked down in Phase 6.
- No seed data yet (Phase 2's `identity-service` seed script is first).
- `packages/audit-service`'s schema currently connects via `AUDIT_DATABASE_URL` (owner) for both migrate and (for now) any future runtime use; the actual `audit_writer` role SQL and the runtime-vs-migration connection split are Phase 5 scope, not yet applied.

---

## Maintenance — Dependency security audit (2026-07-29)

**Status:** complete

**Completed features:**
- `npm audit fix` (no `--force`) run at repo root: confirmed a genuine no-op for `brace-expansion`/`tar` (see Known issues below) — no lockfile changes resulted from it.
- `sharp` (high, inherited libvips CVEs): installed as a **direct** dependency at the latest patched version (`0.35.3`) in both `frontend/apps/support-hub` and `frontend/apps/review-console` via `npm install sharp@latest -w <app>`. This alone wasn't sufficient — `next@15.5.22`'s own `optionalDependencies` pins `sharp: ^0.34.3`, so npm nested a second, still-vulnerable `sharp@0.34.5` copy per app. Added a root-level `"overrides": { "sharp": "^0.35.0" }` in `package.json` and ran `npm update sharp` to force the whole tree (including next's optional dep) onto `0.35.3`. Verified via `npm ls sharp` — single deduped `0.35.3` everywhere, zero `invalid` entries. `next` confirmed unchanged (`15.5.22`) in both apps via `npm ls next`. Both apps' `npm run dev` verified starting cleanly afterward.
- `diff` (DoS in `parsePatch`/`applyPatch`, used by `pr-service`'s planned version-diff feature): searched `packages/pr-service/src` for any import of `diff` — found none. `pr-service` is still Phase-1 scaffold only (`src/server.js` + generated Prisma client; no routes/services yet), so the version-diff endpoint that will consume this package doesn't exist yet. Bumped `packages/pr-service`'s declared dependency from `^7.0.0` to `^9.0.0` (latest) via `npm install diff@latest -w packages/pr-service` since there's no existing call site to break. **Flag for whichever phase implements the version-diff endpoint:** check the `diff@7` → `diff@9` changelog for signature changes (module changed to dual ESM/CJS, some function options changed) before wiring up `diffLines` or similar.
- Final `npm audit`: down from 10 to **8 vulnerabilities** (1 moderate, 6 high, 1 critical) — all transitive, all documented as accepted known limitations in `docs/known-limitations.md` (new file) rather than silently left unexplained.
- Confirmed unchanged from before this task, across the whole tree: `next@15.5.22`, `react@18.3.1`, `express@4.22.2`, `prisma@6.19.3`.

**Files modified:**
- `package.json` (root) — added `"overrides": { "sharp": "^0.35.0" }`.
- `frontend/apps/support-hub/package.json`, `frontend/apps/review-console/package.json` — added direct `"sharp": "^0.35.3"` dependency.
- `packages/pr-service/package.json` — `diff` bumped `^7.0.0` → `^9.0.0`.
- `package-lock.json` — regenerated to match the above.
- `docs/known-limitations.md` — **new file.** Documents the 3 categories of remaining `npm audit` findings (postcss bundled in next, brace-expansion + tar transitive via bcrypt's node-pre-gyp) and exactly why each can't be fixed without a breaking/risky change right now.

**Remaining work:** none for this maintenance pass — this was an out-of-band security-hygiene task, not a numbered phase; Phase 2 is still next in the actual build sequence.

**Known issues / TODOs:**
- `brace-expansion` (high) and `tar` (critical) remain vulnerable, transitively via `bcrypt`'s `@mapbox/node-pre-gyp` install tooling. `npm audit fix` (no force) is a true no-op for these — verified by running it twice including in verbose mode. The patched majors (`brace-expansion@5.0.8`, `tar@7.5.21+`) are pure ESM and would break `require()` in `minimatch`/`node-pre-gyp` if forced via `overrides`, breaking bcrypt's install/rebuild step. User explicitly chose to accept this as a documented known limitation rather than risk the override. See `docs/known-limitations.md` for full detail. Revisit when `bcrypt`/`node-pre-gyp` ships ESM-compatible support.
- `postcss` (moderate, bundled inside `next/node_modules/postcss`) remains vulnerable — only fix path is `npm audit fix --force`, which would downgrade `next` to `9.3.3` and break the App Router. Explicitly rejected per this task's instructions. See `docs/known-limitations.md`.

---

## Phase 2 — Identity Service: Auth, Org Management, RBAC, Org Switcher, Session Sync, Cross-Org Connections

**Status:** complete (2026-07-29)

**Completed features:**
- `packages/shared` real implementations: `jwt.js` (`sign`/`verify`, RS256, keys decoded from base64 `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`), `middleware/authenticate.js` (Bearer-token verify, attaches `req.user`), `middleware/requireRole.js` (blanket role gate, auto-bypass for `isPlatformAdmin`, returns 403), `middleware/internalAuth.js` (`X-Internal-Api-Key` check, 401 on missing/mismatch).
- `packages/identity-service/src/lib/`: `prisma.js`, `redis.js` (node-redis v6 client + `connectRedis()`), `errors.js` (`AppError`), `session.js` — the refresh-token state machine in Redis: `refresh:<token>` (live JSON `{userId, activeOrgId, orgRole}` or a short-TTL revoked tombstone `{userId, revoked:true}`) plus `session:<userId>` (a Set of live tokens, for logout-everywhere). Rotation tombstones the old token instead of deleting it outright — that's what makes reuse-of-a-rotated-token detectable (tombstone hit ⇒ wipe every token in `session:<userId>`), rather than looking identical to a garbage/expired token.
- `packages/identity-service/src/services/`: `auth.service.js` (register/login/refresh/switchOrg/logoutEverywhere/getMe — all password hashes stripped via `serializeUser` before any response), `org.service.js`, `connection.service.js`.
- `packages/identity-service/src/routes/`: `auth.routes.js` (`POST /auth/register`, `/login` [rate-limited], `/refresh`, `/switch-org`, `DELETE /auth/session`, `GET /auth/me`), `orgs.routes.js` (`GET /orgs/:id`, member CRUD, `POST`/`GET /orgs/:id/connections`), `connections.routes.js` (`PATCH /connections/:id`), `internal.routes.js` (`GET /internal/connections/status`).
- Rate limiting on `/auth/login`: 5 attempts / 15 min, keyed by `ipKeyGenerator(req.ip) + email` (express-rate-limit v8 requires the IPv6-safe helper, not raw `req.ip` — see Known issues), `standardHeaders`/`legacyHeaders` both off so no `RateLimit-*`/`Retry-After` state leaks on the 429.
- Refresh token: opaque 96-char hex string, `httpOnly`+`Secure`+`SameSite=Lax` cookie (`froncort_refresh_token`), TTL from `REFRESH_TOKEN_TTL_DAYS`.
- 404-vs-403 discipline applied precisely per `api_reference.md`'s role table, not uniformly: routes where the table lists "OA (own org) or PSA" use `requireRole('ORG_ADMIN')` (which auto-bypasses for `isPlatformAdmin`) plus a same-org check in the service layer (404 on mismatch). Routes where the table deliberately excludes PSA (`POST /orgs/:id/connections`, `PATCH /connections/:id`) do **not** use `requireRole` at all — a blanket PSA bypass there would have been a real access-control bug — and are gated only by explicit org-admin-of-this-specific-org checks inside `connection.service.js`.
- `packages/identity-service/prisma/seed.js`: 2 orgs (Alpha Support Co., Beta Review Partners), 3 users per org (`admin@`/`agent@`/`reviewer@{alpha,beta}.test`, one per `OrgRole`), 1 Platform Super Admin (`super@froncort.ai`, seed-only per the locked rule — no promotion endpoint exists), 1 `APPROVED` connection Alpha→Beta. All seeded users share password `Password123!`. Uses fixed UUIDs + `upsert` throughout so re-running `npx prisma db seed` is idempotent. Registered via `package.json`'s `"prisma": {"seed": "node prisma/seed.js"}`.
- Full curl test pass (see Known issues for the one gap): register → duplicate-email 409 → login → `/auth/me` → refresh (rotates cookie) → reuse of the old rotated token → `SESSION_REVOKED`, and confirmed the *new* rotated token was also killed by that reuse (whole-session wipe, not just the reused token) → switch-org to a non-member org → 404 → logout-everywhere → refresh afterward → `UNAUTHENTICATED`. Connections: request → wrong-org approve attempt → 403 → correct-org approve → revoke → re-approve-after-revoke → `INVALID_TRANSITION` (400) → fresh request in the reverse direction → approve succeeds → internal `/internal/connections/status` reflects `approved:false` immediately after revoke. BOLA checks: cross-org `GET /orgs/:id` and `POST /orgs/:id/members` both return 404 (not 403) for a caller outside that org; a `SUPPORT_AGENT` hitting an OA-only route gets 403 (right org, wrong role — correctly distinguished from the 404 case). Rate limiter: 5 logins pass, 6th+ return 429 with no rate-limit headers. PSA confirmed bypassing the own-org check on `GET /orgs/:id`. Internal endpoint confirmed 401 with no key and with a wrong key.

**Files modified:**
- `packages/shared/jwt.js`, `packages/shared/middleware/{authenticate,requireRole,internalAuth}.js` — stubs replaced with real implementations.
- `packages/identity-service/src/lib/{prisma,redis,errors,session}.js` — new.
- `packages/identity-service/src/services/{auth,org,connection}.service.js` — new.
- `packages/identity-service/src/routes/{auth,orgs,connections,internal}.routes.js` — new.
- `packages/identity-service/src/server.js` — rewritten: mounts all 4 routers, adds `cookie-parser`, adds a global error handler translating `ZodError` → 400, `AppError` → its own status/code, Prisma `P2023` (malformed UUID path param) → 404 (not a 500 — never leak more than "doesn't exist" to a caller poking at an ID that isn't theirs), everything else → 500. Redis connects before `app.listen`.
- `packages/identity-service/prisma/seed.js` — new.
- `packages/identity-service/package.json` — added `redis`, `cookie-parser`, `express-rate-limit` dependencies and the `prisma.seed` config block.

**Remaining work:** Phase 3 (ticket-service) is next. `orgScope.js`'s real implementation (`ownsResource`/`checkShareAccess`) is Phase 3 scope, not touched here — identity-service's own org/connection ownership checks are local to this service (see Known issues) precisely because that shared helper isn't real yet.

**Known issues / TODOs:**
- **`POST /orgs/:id/members` assumes the target user already has an account.** No invite/email-send flow exists in this build (not in Phase 2 scope, no route for it in `api_reference.md`). If the email doesn't match an existing `User`, the endpoint 404s with `USER_NOT_FOUND` rather than silently creating a passwordless account. Revisit only if a later phase's spec explicitly adds an invite flow.
- **`express-rate-limit` v8 (installed) changed its `keyGenerator` contract** since the version implicitly assumed when this guide was written — a raw `${req.ip}:${email}` key throws `ERR_ERL_KEY_GEN_IPV6` at startup. Fixed by using the library's own `ipKeyGenerator()` helper. No behavior change from what the spec asked for (still IP+email combined), just an IPv6-safe key shape.
- **No automated Jest/Supertest suite added this phase.** `CLAUDE.md`'s tech stack lists Jest+Supertest generally, but Phase 2's own Definition of Done only requires curl/Postman verification, which is what was done (see Completed features). Consider backfilling identity-service tests in a later phase if the assignment wants automated coverage demonstrated, but that's beyond what this phase's spec asked for.
- CORS is still wide open (`cors()`, no allowlist) — unchanged from Phase 1, locked down in Phase 6 per the existing TODO comment in `server.js`.

---

## Phase 2 patch — audit wiring, revoke-then-reconnect fix, deterministic org ordering (2026-07-29)

Follow-up pass after `implementation_guide.md`/`CLAUDE.md` were updated post-Phase-2. Three items, all now resolved:

**1. `req.user.activeOrgId` naming — confirmed, not a bug.** `CLAUDE.md` rule #1 now explicitly locks camelCase (`activeOrgId`) as the convention, matching what was already built. No code change needed; the earlier "flagged deviation" note in this log is removed since it's resolved.

**2. Connection lifecycle is now audit-logged.** `implementation_guide.md`'s Phase 2 scope never told Claude Code to wire `auditClient.log(...)` into `connection.service.js` — a gap in the guide, not a Phase-2 miss, per the user. Added calls for all three transitions (`CONNECTION_REQUESTED` on `requestConnection`, `CONNECTION_APPROVED`/`CONNECTION_REVOKED` on `respondToConnection`), each wrapped in a `logAudit()` helper in `connection.service.js` that swallows the error and `console.warn`s instead of throwing — necessary because `auditClient.log()` is still a Phase-5 stub that throws unconditionally, and a connection mutation that already succeeded must never be undone by that. Verified live: all three calls fire exactly once per successful mutation (confirmed via server log lines `"audit log call failed (expected until Phase 5 wires audit-service)"`), and the HTTP response still succeeds (201/200) regardless. **Flag for Phase 5:** confirm these three calls actually land once the real `POST /internal/audit-events` endpoint exists — this is exactly the "go back and confirm" instruction now in `implementation_guide.md`'s Phase 5 section.

**3. Revoke-then-reconnect in the same direction — tested, found a different bug than the one suspected, fixed it.** The premise in the guide patch ("unique constraint is on `(requesterOrgId, partnerOrgId)`, will collide on same-direction re-request") doesn't match the actual schema — checked `packages/identity-service/prisma/migrations/20260729131113_init/migration.sql` directly: `OrgConnection` has never had a unique constraint, only two independent non-unique indexes. Live test confirmed same-direction re-request after a revoke already succeeded (no collision), but for the wrong reason — nothing was stopping a *duplicate simultaneous PENDING/APPROVED* request for the same directed pair either. Fixed with an application-level guard in `requestConnection()`: 409 `CONNECTION_ALREADY_ACTIVE` if a PENDING or APPROVED row already exists for that exact `(requesterOrgId, targetOrgId)` pair; a REVOKED row for that same pair is explicitly allowed to coexist with a new request. **Deliberately did not add a DB-level partial unique index** (`UNIQUE ... WHERE status IN ('PENDING','APPROVED')`) as the guide's alternative option suggests — Prisma's schema DSL cannot express partial/filtered unique constraints, and hand-writing the raw SQL into a migration risks `prisma migrate dev`'s drift detection proposing a reset the next time `schema.prisma` changes (a genuinely destructive risk to the dev DB, not a hypothetical one). The application-level guard is the sole enforcement mechanism; documenting that choice here per the guide's "resolve and document" instruction. Verified live end-to-end on a fresh org pair (Alpha↔Gamma): request → approve → revoke → same-direction re-request → succeeds (new PENDING row, old REVOKED row untouched) → immediate second same-direction request while the first is still PENDING → 409.

**4. Deterministic "primary" org on login.** `auth.service.js`'s `login()` and `getMe()` now `orderBy: { createdAt: 'asc' }` on the `memberships` include, so the org chosen as `activeOrgId` on login (and the order returned by `/auth/me`) no longer depends on Postgres's unspecified default row order.

**Files modified:**
- `packages/identity-service/src/services/connection.service.js` — added `logAudit()` helper + 3 call sites; added the duplicate-active-connection guard in `requestConnection()`.
- `packages/identity-service/src/services/auth.service.js` — added `orderBy: { createdAt: 'asc' }` to the `memberships` include in `login()` and `getMe()`.
- `docs/project-progress.md` — this entry; removed the now-resolved camelCase deviation note from the original Phase 2 entry.

**Remaining work:** none — Phase 3 is still next.

**Known issues / TODOs:**
- The DB-level partial unique index for active connections was deliberately not added (see item 3 above). If a later phase wants it, the safest path is a one-off `prisma db execute` against the raw SQL, tracked outside `migrate dev`'s normal drift-detected flow, not a hand-edited migration folder.

---

## Phase 2 patch, round 2 — bidirectional connection guard + audit-blocking flagged as unresolved (2026-07-29)

User caught two real gaps in the round-1 patch above before Phase 3 started. Both confirmed live, both fixed:

**1. The `requestConnection()` duplicate-active guard only checked the exact `(requesterOrgId, targetOrgId)` direction, not the reverse.** This meant Alpha→Beta could be `APPROVED` while Beta→Alpha was independently requested and left `PENDING` — two live rows representing the same org-pair relationship with conflicting status, which would make `GET /internal/connections/status`'s answer depend on which row `findFirst` happened to return first (it uses `OR` across both directions already, so it wouldn't actually crash, but the underlying data integrity problem — two contradictory "is this pair connected" answers stored simultaneously — is exactly what the guard was supposed to prevent). **Confirmed this exact state already existed in the dev DB** from round-1 testing (Alpha→Beta `PENDING` + Beta→Alpha `APPROVED` at the same time) before the fix. Fixed by widening the guard's `where` to an `OR` across both directions. Deleted the stale conflicting test row from round 1 (`id 00dd3fbf-...`) so the dev DB isn't left in an inconsistent state. Re-verified live: with Beta→Alpha `APPROVED`, Alpha requesting Alpha→Beta (reverse direction) now correctly 409s `CONNECTION_ALREADY_ACTIVE`.

**2. The audit-call error-swallowing in `logAudit()` is a Phase 2 stopgap, not a decided final design — flagged explicitly, not left ambiguous.** `auditClient.log()` has to fail silently right now because audit-service doesn't exist yet (Phase 5). But CLAUDE.md rule #9 ("calls `auditClient.log(...)` **before returning success** to the caller") and the documented ticket/pr-service trade-off both point toward the real design being synchronous and mutation-blocking — a down/slow audit-service should fail the mutation, not silently lose the audit trail, on an assignment graded partly on audit integrity. Left as graceful-degradation for now (correctly, per `implementation_guide.md`'s Phase 3 line permitting this "for now" as an explicitly temporary gap), but added a loud comment in `connection.service.js` spelling out that Phase 5's wiring-up pass must explicitly decide: either switch identity-service's connection calls to blocking (matching ticket/pr-service), or deliberately keep graceful degradation and update CLAUDE.md rule #9 to say so for all three services — not leave a silent inconsistency between them.

**Files modified:**
- `packages/identity-service/src/services/connection.service.js` — `requestConnection()`'s active-connection guard now checks both directions; `logAudit()`'s comment rewritten to flag the swallow-vs-block decision as unresolved, pointing at Phase 5.
- Dev DB: deleted one stale test row (`OrgConnection id 00dd3fbf-f183-4557-9b52-d43ff5674142`) left in a conflicting state by round-1 testing — not a schema/seed change, just test-data cleanup.

**Remaining work:** none — Phase 3 is still next.

**Known issues / TODOs:**
- **Carried forward, now explicit:** Phase 5 must reconcile audit-call error handling across all 3 services (identity-service's connection calls vs. ticket/pr-service's) — either all blocking or all graceful-degradation-with-documented-CLAUDE.md-update, not a silent mismatch. See `logAudit()`'s comment in `connection.service.js` for the exact reasoning to resolve.

---

## Phase 3 — Support Hub Backend (ticket-service) (2026-07-29)

**Status:** complete

**Completed features:**
- `packages/shared/orgScope.js`: real implementation — `ownsResource(resourceOrgId, callerOrgId)` (pure, no I/O) and `checkShareAccess({resourceOrgId, callerOrgId, shareRow, connectionApproved})` (pure, the full 5-step check: own org → `'OWNER'`; no share row → `null`; share revoked → `null`; connection not approved → `null`; else → `'VIEW_COMMENT'`). Both are the single, reusable, directly-unit-testable BOLA defense the guide asked for — sanity-checked all 5 decision paths inline before wiring anything else to it.
- **`packages/shared/middleware/requireRole.js` signature changed:** `requireRole(allowedRoles: string[], { allowPlatformAdmin? })` — PSA bypass is now an explicit, opt-in parameter instead of a hardcoded default, per `CLAUDE.md`'s new "Platform Super Admin scope" section (added mid-phase after I flagged that ticket-service's api_reference.md table never lists PSA for any endpoint, so the old auto-bypass would've silently granted PSAs cross-org ticket visibility the spec never intended). Defaults to `allowPlatformAdmin: true` only so identity-service's existing calls keep working unchanged; every call in ticket-service passes `{ allowPlatformAdmin: false }` explicitly. Updated identity-service's 4 existing call sites to the new array-argument form (`requireRole('ORG_ADMIN')` → `requireRole(['ORG_ADMIN'])`) and additionally moved `POST /orgs/:id/connections` and `PATCH /connections/:id` onto the shared middleware (`{ allowPlatformAdmin: false }`) now that it can express "no PSA" — previously these two skipped `requireRole` entirely because it couldn't. Re-verified identity-service's full role/PSA behavior afterward (SA still 403s on member-add, OA still fine, PSA still bypasses `GET /orgs/:id/connections`) — no regressions.
- `packages/shared/identityClient.js`: new — `checkConnectionApproved(orgA, orgB)` calls identity-service's `GET /internal/connections/status` with the internal API key header. Returns `false` (never throws) on any failure, including identity-service being unreachable — a down identity-service must never be silently treated as "connection approved." Built here, explicitly for reuse by pr-service in Phase 4 per the guide.
- `packages/ticket-service/src/lib/`: `prisma.js`, `errors.js` (`AppError`), `upload.js` (multer config — see storage note below).
- `packages/ticket-service/src/services/`: `ticket.service.js` (`resolveTicketAccess` — the single entry point combining `ownsResource`'s cheap fast-path with `checkShareAccess`'s full check, plus create/list/get/update/delete), `comment.service.js`, `attachment.service.js`, `share.service.js`, `featureFlag.service.js`. Every mutation calls a local `logAudit()` helper (same swallow-and-warn pattern as identity-service's Phase 2 patch, same "TEMPORARY, reconcile at Phase 5" comment).
- `packages/ticket-service/src/routes/`: `tickets.routes.js` (full CRUD + comments + attachments + shares, all nested under `/tickets`), `orgs.routes.js` (`GET /orgs/:orgId/feature-flags`). Zod validation on every route body (`createTicketSchema`, `updateTicketSchema`, `commentSchema`, `shareSchema`) plus the query schema for `GET /tickets?status=`.
- `packages/ticket-service/src/server.js`: rewritten — mounts both routers, serves `/uploads` via `express.static`, global error handler matching identity-service's pattern (`ZodError` → 400, `AppError` → its own status/code, `multer.MulterError` → 400, Prisma `P2023` → 404, else 500).
- **Locked storage mechanism implemented exactly as specified:** `multer.memoryStorage()` (not `diskStorage` — see Known issues for why), file written to `packages/ticket-service/uploads/` only *after* `attachment.service.js`'s `ownsResource` check passes, filename `${crypto.randomUUID()}-${sanitizedOriginalName}`, `Attachment.fileUrl` stores the relative `/uploads/<filename>` path, served back via `express.static`. Verified live: upload → file lands on disk → `GET /uploads/<filename>` returns the exact original content.
- `packages/identity-service/prisma/seed.js` **modified**: `User` rows now get fixed IDs too (previously only `Organization`/`OrgConnection` did) — see Known issues for why this was necessary, and the exact process used to migrate already-seeded dev data onto the new IDs without touching unrelated data (the manually-registered Gamma org/user were left untouched).
- `packages/shared/seedIds.js`: new — single source of truth for every fixed seed ID (2 orgs, 1 connection, 7 users), imported by both `identity-service` and `ticket-service`'s seed scripts so cross-service seed data can reference each other without a runtime cross-schema dependency.
- `packages/ticket-service/prisma/seed.js`: new — 3 tickets (2 Alpha, 1 Beta), 1 comment, 2 feature flags (`AI_DIGEST_ENABLED`, one per org), 1 cross-org share (ticket1 → Beta), per the master spec's seed plan. Idempotent via `upsert` + fixed IDs, same pattern as identity-service's seed.
- `.gitignore`: added `uploads/`.

**Verification (per the phase's explicit rigor requirements):**
- **BOLA test with a manipulated foreign-org ID, shown not just claimed:** logged in as Beta's org admin, hand-crafted `GET /tickets/10000000-0000-0000-0000-000000000002` (Alpha's real, non-shared ticket ID). Result: `HTTP 404`, body `{"error":{"message":"Ticket not found","code":"NOT_FOUND"}}` — no ticket data, no 403. Repeated for `GET .../comments`, `PATCH`, `DELETE` on the same ID — all 404, same message, same code.
- **Full share lifecycle, end-to-end:** ticket1 (Alpha) was pre-shared with Beta via seed. Confirmed Beta could `GET` it (200) and `POST` a comment (201). Confirmed Beta could **not** `PATCH`, `DELETE`, re-`POST /shares`, or `POST /attachments` on it (all 404 — guest access never reaches those own-org-only code paths at all). Then revoked the *underlying connection* (not the share row) via identity-service's `PATCH /connections/:id` — actually had to revoke two simultaneously-APPROVED Alpha↔Beta connections (see Known issues: a reseed side-effect during this phase's setup, not a Phase 3 bug). Re-tested: Beta's `GET`/`POST comment` on ticket1 now both 404. Fetched `GET /tickets/:id/shares` as Alpha and confirmed the share row itself was completely untouched (`revokedAt: null`, unchanged `createdAt`) — access disappeared purely because `checkShareAccess`'s connection-approved step failed, not because anything about the share was modified. Re-approved a fresh connection afterward and confirmed Beta's access returned, to leave the dev DB demo-ready.
- **Full CRUD + role/org discipline:** SA created a ticket, REV could view+comment on it (own org), SA updated it, SA got 403 attempting delete (OA-only), OA deleted it successfully (204). Feature flags: Alpha read its own (200), Beta got 404 on Alpha's (never 403).
- **Audit calls confirmed firing** (non-blocking, per the Phase 2 stopgap pattern) for `TICKET_CREATED`, `TICKET_UPDATED`, `TICKET_DELETED`, `COMMENT_ADDED`, `ATTACHMENT_ADDED`, `TICKET_SHARED`, `TICKET_SHARE_REVOKED` — verified via the `"audit log call failed (expected until Phase 5...)"` warning appearing exactly once per mutation in the server log, with every mutation's HTTP response still succeeding regardless.

**Bug found and fixed during this phase's own testing (not in the original build):** the first `attachment.service.js`/`upload.js` pass used `multer.diskStorage`, which writes the uploaded file to disk in middleware, *before* the route handler's authorization check runs. Caught this live: Beta's org admin (right role name — `ORG_ADMIN` — just the wrong org for this ticket) got correctly 404'd by the business logic, but the file had already been written to `uploads/` with no `Attachment` DB row ever pointing to it — an orphaned file, not a data leak, but still wrong. Fixed by switching to `multer.memoryStorage()` and moving the actual `fs.writeFile` into `attachment.service.js`, after the `ownsResource` check. Re-tested the identical scenario afterward: 404, and confirmed via `ls` that no file was written.

**Files modified:**
- `packages/shared/orgScope.js`, `packages/shared/identityClient.js` (new), `packages/shared/seedIds.js` (new), `packages/shared/index.js` (added `identityClient` export), `packages/shared/middleware/requireRole.js` (new signature).
- `packages/identity-service/src/routes/orgs.routes.js`, `packages/identity-service/src/routes/connections.routes.js` (updated to new `requireRole` signature; two routes gained explicit `{ allowPlatformAdmin: false }`).
- `packages/identity-service/prisma/seed.js` (fixed user IDs via `packages/shared/seedIds.js`).
- `packages/ticket-service/src/lib/{prisma,errors,upload}.js` (new), `packages/ticket-service/src/services/{ticket,comment,attachment,share,featureFlag}.service.js` (new), `packages/ticket-service/src/routes/{tickets,orgs}.routes.js` (new), `packages/ticket-service/src/server.js` (rewritten), `packages/ticket-service/prisma/seed.js` (new), `packages/ticket-service/package.json` (added `prisma.seed` config).
- `.gitignore` (added `uploads/`).
- Dev DB: deleted and re-seeded the 7 identity-service seed users onto fixed IDs (memberships deleted and recreated too); the manually-registered Gamma org/user from earlier session testing were left untouched. Revoked and re-approved the Alpha↔Beta connection during share-lifecycle testing, ending in the same `APPROVED` state it started in.

**Remaining work:** Phase 4 (pr-service) is next. It's explicitly meant to reuse `packages/shared/identityClient.js` and the `orgScope`/`checkShareAccess` pattern rather than rewriting either — and per this phase's PSA discovery, every `requireRole()` call in pr-service must also pass `{ allowPlatformAdmin: false }` (already noted in `implementation_guide.md`'s Phase 4 section).

**Known issues / TODOs:**
- **Flagged mid-phase, now resolved:** `implementation_guide.md`'s Phase 3 seed plan needed ticket-service's seed to reference identity-service's exact seeded users, but identity-service's Phase 2 seed only had fixed IDs for `Organization`/`OrgConnection`, not `User` (random `@default(uuid())` on creation). My first instinct was a seed-time-only raw cross-schema SQL read from ticket-service's seed script — the user (correctly) redirected this to a cleaner fix: give `User` rows fixed IDs too, exported from a new `packages/shared/seedIds.js` single source of truth, imported directly by both seed scripts. Implemented that instead. Required migrating the dev DB's already-seeded users (created with random IDs during Phase 2 testing) onto the new fixed IDs — deleted their `OrgMembership` rows (FK is `ON DELETE RESTRICT`) then the `User` rows themselves, then re-ran the seed. `pr-service`'s Phase 4 seed script can now just import the same constants.
- **Flagged mid-phase, now resolved:** ticket-service's `api_reference.md` table never lists PSA for any endpoint — using the old `requireRole()` (unconditional PSA bypass) anywhere here would have silently given Platform Super Admins a cross-org ticket-visibility capability never in the spec. Surfaced this before writing any routes; the user confirmed it was already a locked decision (not an open question) and directed a shared-middleware fix (`{ allowPlatformAdmin: false }` parameter) over a local/duplicated role-gate — `CLAUDE.md`, `api_reference.md`, and `implementation_guide.md` were all updated mid-phase to lock this in writing. See the `requireRole.js` entry above.
- **A reseed side-effect surfaced a real gap during share-lifecycle testing:** identity-service's seed script does `orgConnection.upsert({ ..., update: { status: 'APPROVED' } })` — it force-resets the seeded connection to `APPROVED` on every reseed, silently undoing any manual revoke from prior testing. Re-running the seed mid-Phase-3 (to migrate user IDs) reset the original seed connection back to `APPROVED` while a *second*, independently-approved connection (from Phase 2 testing, opposite direction) was already sitting there too — i.e., two simultaneously-APPROVED connections for the same org pair, the exact ambiguity the Phase 2 patch's bidirectional guard was built to prevent at the request-time layer. The guard only applies to `POST /orgs/:id/connections`; the seed script writes directly via Prisma and bypasses it entirely. Not fixed this phase (seed-script idempotency behavior, not a Phase 3 scope item) — flagging for whoever next touches identity-service's seed script: either make the `OrgConnection` upsert's `update` a no-op (`{}`) like `Organization`'s, or run seed data through the same guarded service functions instead of raw Prisma writes.
- Attachment uploads have no file-type allowlist/denylist — any MIME type up to 10MB is accepted. Not specified in `api_reference.md`; revisit only if a later phase's spec adds one.
- Same Phase-5-reconciliation flag as Phase 2: `logAudit()`'s swallow-and-warn behavior in `ticket.service.js` is still a stopgap, not a decided final design — same comment, same open question, carried forward.
- `docs/known-limitations.md` should get the "uploads don't survive a Railway redeploy" note at Phase 9, per `implementation_guide.md`'s explicit instruction — not added yet since that file is Phase 9 scope.

---

## Phase 3 patch — requireRole fail-safe default, seed force-reset fix, share-rejection test (2026-07-29)

User caught one real design flaw and one deferred-fix-that-shouldn't-have-been-deferred in the Phase 3 entry above, plus asked for a test that was scoped but never actually shown. All three addressed:

**1. `requireRole()`'s PSA-bypass default was backwards — fixed to fail-safe.** The Phase 3 version defaulted `allowPlatformAdmin` to `true` unless a call site explicitly opted out (`false`). User correctly identified this as opt-out-of-a-security-bypass rather than opt-in, and pointed out it contradicts `CLAUDE.md`'s own "not a hardcoded default" instruction: any future route in any service that simply forgets the option would silently inherit a PSA bypass nobody documented — the identical bug Phase 3 caught for ticket-service, except failing unsafe instead of safe. Flipped `packages/shared/middleware/requireRole.js` so `allowPlatformAdmin` defaults to `false`; every call site must now state its intent explicitly in both directions. Updated identity-service's 4 previously-implicit calls (`GET /orgs/:id/connections`, `POST/PATCH/DELETE /orgs/:id/members`) to pass `{ allowPlatformAdmin: true }` explicitly — these are the routes `api_reference.md`'s table actually lists PSA for. The 2 connection routes already passed `{ allowPlatformAdmin: false }` explicitly, no change needed there. Regression-tested: PSA still bypasses where it should (member-add, connections-list — both still 200/201), still correctly denied where it shouldn't (`POST /orgs/:id/connections` — now 403 instead of the old 404, see note below), ticket-service still zero PSA visibility.
  - **Side note on that 403-vs-404 change:** `POST /orgs/:id/connections` previously had no `requireRole` gate at all (the old middleware couldn't express "no PSA", so Phase 2 skipped it and relied entirely on `connectionService.assertOrgAdminStrict`'s 404). Phase 3 added a `requireRole(['ORG_ADMIN'], { allowPlatformAdmin: false })` gate in front of that for consistency with the other routes, which means a PSA hitting this route now fails at the router (403: wrong role, matching how a wrong-role-but-real-org caller like an SA is treated) instead of the service layer (404: not their org). This is a genuine behavior change from Phase 2, not something asked for in this patch round — flagging it here rather than letting it pass silently, since it wasn't the focus of what was asked but is a direct consequence of it.
- **Real bug this fix surfaced and required fixing immediately:** PSA hitting `GET /tickets/:id` or `GET /tickets` in ticket-service returned `500 Internal Server Error`, not `404`. Root cause: PSA has `activeOrgId: null` (no `OrgMembership` exists for PSAs by design), and `resolveTicketAccess`/`listTickets` were passing that `null` straight into Prisma `where` filters on `TicketShare.partnerOrgId`/`Ticket.orgId` — both non-nullable columns — which Prisma rejects with a hard validation error instead of just matching nothing. Fixed by short-circuiting both functions to return "no access"/empty-list immediately when `caller.activeOrgId` is falsy, before ever building the query. Re-tested: PSA now gets a clean `404 {"error":{"message":"Ticket not found",...}}` on ticket detail and `200 {"data":[]}` on the list — exactly the behavior every other non-owning, non-sharing caller already got.

**2. Fixed the `OrgConnection` seed force-reset now, not deferred.** `packages/identity-service/prisma/seed.js`'s `orgConnection.upsert` used `update: { status: 'APPROVED' }`, silently resetting the connection to `APPROVED` on every reseed regardless of its actual current state — this is exactly what produced the dual-APPROVED-connection state cleaned up mid-Phase-3. Changed to `update: {}`, matching `Organization`'s pattern exactly. Also fixed the seed script's closing log line, which previously hardcoded `"Connection: APPROVED, ..."` regardless of the row's real status — now reads the actual upserted row back and logs its real status. Verified live: revoked the seed connection via the API, re-ran `npx prisma db seed`, confirmed the connection was still `REVOKED` afterward (not force-reset).

**3. Added the missing share-creation-rejection test, shown explicitly.** Prior testing covered revoking an already-shared ticket's connection and the full existing-share lifecycle, but never actually attempted `POST /tickets/:id/shares` against a partner org with no approved connection. Tested all 3 relevant states for completeness: **no connection at all** (Beta's ticket3 → Gamma, zero connection ever requested) → `400 CONNECTION_NOT_APPROVED`; **PENDING but not yet approved** (Alpha's ticket1 → Gamma, requested but unapproved) → same `400 CONNECTION_NOT_APPROVED`; **APPROVED** (after Gamma approved the pending request) → `201`, share created successfully. All three shown as actual curl output, not asserted.

**Files modified:**
- `packages/shared/middleware/requireRole.js` — default flipped, comment rewritten explaining why.
- `packages/identity-service/src/routes/orgs.routes.js` — 4 `requireRole` calls now pass `{ allowPlatformAdmin: true }` explicitly; reformatted for readability.
- `packages/ticket-service/src/services/ticket.service.js` — null-`activeOrgId` guards added to `resolveTicketAccess` and `listTickets`.
- `packages/identity-service/prisma/seed.js` — `orgConnection.upsert`'s `update: { status: 'APPROVED' }` → `update: {}`; closing log line now reads the real status back instead of hardcoding it.
- Dev DB: revoked/re-approved the Alpha↔Beta connection multiple times during this round's testing (Gamma's connection to Alpha also moved PENDING → APPROVED as part of the share-rejection test); one extra `TicketShare` row now exists (ticket1 shared with Gamma) as a byproduct of the positive-case test — harmless, left in place.

**Remaining work:** none — Phase 4 is still next. The `known issues` entry from the original Phase 3 log about the seed force-reset (item above, "flagging for whoever next touches identity-service's seed script") is now resolved by this patch; not deleting that entry per this file's own "never edit a previous entry" rule, but noting the supersession here.

**Known issues / TODOs:**
- The `POST /orgs/:id/connections` 403-vs-404-for-PSA change noted above is a genuine, if minor, behavior change from Phase 2 — not flagged as wrong, just flagged as a side effect worth being aware of if anything downstream (tests, docs, a future frontend) assumed the old 404.

---

<!--
Copy the block below for each subsequent phase as it completes. Keep phases in order, oldest first.

## Phase N — <name>

**Status:** complete | in progress | blocked

**Completed features:**
-

**Files modified:**
-

**Remaining work:**
-

**Known issues / TODOs:**
-
-->
