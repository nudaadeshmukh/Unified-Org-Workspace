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

## Phase 3 patch, round 2 — PSA restored on connection endpoints (2026-07-29)

The requireRole fail-safe-default fix (previous patch) made a real, previously-invisible spec gap visible: `POST /orgs/:id/connections` and `PATCH /connections/:id` were built in Phase 2 as PSA-excluded, but `api_reference.md`'s connections table actually lists PSA for both, matching the assignment's own description of PSA's scope ("manages... cross-org connections") and the pattern already used for member-management. This was never a real bug in Phase 2 — the old `requireRole()` bypassed PSA unconditionally regardless of the table, so the exclusion was already broken (in the permissive direction) from day one; the fail-safe fix just made the gap between "what the code does" and "what the table says" visible for the first time, in the strict direction. Fixed per the user's 3-part instruction:

**1. Router-level fix.** `packages/identity-service/src/routes/orgs.routes.js`'s `POST /:id/connections` and `packages/identity-service/src/routes/connections.routes.js`'s `PATCH /:id` both now pass `requireRole(['ORG_ADMIN'], { allowPlatformAdmin: true })`.

**2. Service-level fix — this was the real substance of the fix, not just the router flag.** Flipping the router gate alone would have been insufficient: `connection.service.js`'s `requestConnection` used `assertOrgAdminStrict` (caller must literally be `ORG_ADMIN` of the exact `orgId` in the URL — no PSA path at all), and `respondToConnection`'s `isRequesterOrgAdmin`/`isTargetOrgAdmin` checks require `caller.activeOrgId` to equal one of the connection's two orgs — both would still 404/403 a PSA acting on two orgs they don't belong to (PSA typically has `activeOrgId: null`, no `OrgMembership` exists for PSAs by design). Fixed by: replacing `assertOrgAdminStrict` with the existing `assertOrgAdminOrPSA` (already used by `listConnections`, now shared by `requestConnection` too — they were doing the same check except for the PSA line, no reason to keep two functions); adding an explicit `isPSA` bypass in `respondToConnection`, checked alongside (not instead of) the existing `isRequesterOrgAdmin`/`isTargetOrgAdmin` logic, since PSA's authority can't be expressed as "is the target/either org's admin" the way a real member's can — it's a genuinely separate bypass of the whole membership question, same shape as `org.service.js`'s `GET /orgs/:id`.

**3. Explicit regression test, shown as actual output per the request (not "no regressions" asserted):**
- Confirmed PSA had zero `OrgMembership` rows (`GET /auth/me` → `"memberships":[]`) and confirmed no connection existed between Beta and Gamma beforehand (`{"approved":false,"connectionId":null}`).
- PSA `POST /orgs/{betaId}/connections` targeting Gamma → `201`, new `PENDING` row, `requesterOrgId` = Beta (PSA acting on an org it doesn't belong to).
- PSA `PATCH /connections/{id}` `{"status":"APPROVED"}` → `200`, confirmed via `/internal/connections/status` → `{"approved":true,...}`.
- PSA `PATCH /connections/{id}` `{"status":"REVOKED"}` → `200`, confirmed via the same internal check → back to `{"approved":false,"connectionId":null}`.
- OA (Alpha admin) unchanged: `POST /orgs/:id/connections` for their own org still reaches the same business logic as before (correctly hit the existing duplicate-active-connection guard, `409`, since Alpha↔Gamma already had a live connection from earlier patch-round testing); separately revoked and re-approved an existing Alpha↔Gamma connection as OA to show the full lifecycle still works unchanged (`200` both times).
- SA (`agent@alpha.test`) and REV (`reviewer@alpha.test`) both still `403 FORBIDDEN` attempting `POST /orgs/:id/connections` for their own org — role gate unchanged for non-OA, non-PSA roles.

**Files modified:**
- `packages/identity-service/src/services/connection.service.js` — `assertOrgAdminStrict` removed, `requestConnection` now uses `assertOrgAdminOrPSA`; `respondToConnection` gained an explicit `isPSA` bypass checked alongside the existing org-admin conditions.
- `packages/identity-service/src/routes/orgs.routes.js`, `packages/identity-service/src/routes/connections.routes.js` — both routes' `requireRole` calls flipped to `{ allowPlatformAdmin: true }`, comments rewritten to explain the router+service two-layer requirement.

**Remaining work:** none — Phase 4 is still next.

**Known issues / TODOs:**
- The Phase 3 patch round 1 note about `POST /orgs/:id/connections`'s PSA behavior change (403-vs-404) is superseded by this round — PSA no longer hits that role gate at all on this route, so the 403-vs-404 question is moot there now. Not editing that entry, per this file's own rule; noting the supersession here.

---

## Phase 4 — Review Console Backend (pr-service) (2026-07-30)

**Status:** complete

**Two real spec gaps surfaced and resolved with the user before writing code, per CLAUDE.md rule #11 ("stop and ask rather than improvise"):**

1. **`POST /prs`'s role column had a documentation bug.** The original `api_reference.md` listed "OA, SA-equivalent authors" for PR creation, but SUPPORT_AGENT has zero pr-service access anywhere (it's Support Hub/Dashboard 1 only per the assignment brief), and REVIEWER's scope is reviewing, not authoring. The user fixed `api_reference.md` mid-phase to "OA (own org)" only, with an explicit note explaining why. This also resolved a follow-on ambiguity for free: since only ORG_ADMIN can ever author a PR, every other place the table says "Author or OA" / "OA or author" (`PATCH /prs/:id`, `POST /prs/:id/reviewers`) collapses to just "OA of that PR's org" — no separate authorId-vs-role branch was needed anywhere.
2. **`POST /prs/:id/reviewers`'s "Must be a REV in that org" requirement had no way to be enforced.** pr-service had no internal identity-service endpoint to look up a user's role, and inventing one silently would have violated rule #11 too. The user directed adding a new, documented endpoint: `GET /internal/users/:userId/org-role?orgId=` → `{ role: 'ORG_ADMIN'|'SUPPORT_AGENT'|'REVIEWER'|null, isPlatformAdmin }` (200 even when `role: null`, never a 404 — see `api_reference.md`'s Phase 4 note). Built in `identity-service`, with a matching `identityClient.getUserOrgRole(userId, orgId)` in `packages/shared` using the same fail-closed contract as `checkConnectionApproved` (unreachable identity-service → "not verified", never "verified"). Used by `reviewer.service.js`'s `addReviewer` to actually check the target user's role before creating a `PRReviewer` row.

**Completed features:**
- `packages/identity-service/src/services/org.service.js`: new `getUserOrgRole(userId, orgId)`; `packages/identity-service/src/routes/internal.routes.js`: new `GET /internal/users/:userId/org-role` route (internal-API-key gated, same as the existing connections-status route).
- `packages/shared/identityClient.js`: new `getUserOrgRole(userId, orgId)`, fail-closed.
- `packages/pr-service/src/lib/{prisma,errors}.js` — new, identical shape to ticket-service's.
- `packages/pr-service/src/services/pr.service.js` — `resolvePRAccess` (same 5-step orgScope pattern as ticket-service's `resolveTicketAccess`, includes `reviewers`/`reviews` in the fetched PR so `GET /prs/:id` can show them without a separate, undocumented reviewer-list endpoint), `createPR`, `listPRs`, `getPRForViewing`, `updatePR` (full DRAFT/IN_REVIEW/APPROVED/REJECTED/MERGED state machine — see versioning note below), `deletePR`, `recomputeApprovalStatus` (re-derives status from each reviewer's *latest* review only, so a reviewer who flips from CHANGES_REQUESTED back to APPROVED is counted correctly instead of being stuck or double-counted), `logAudit` (same Phase-2/3 swallow-and-warn stopgap, same "reconcile at Phase 5" comment).
- `packages/pr-service/src/services/reviewer.service.js` — `addReviewer`, using the new `getUserOrgRole` check.
- `packages/pr-service/src/services/review.service.js` — `submitReview`: REVIEWER callers must actually be assigned to *this* PR (`PRReviewer` row check) or get 404 (never 403 — CLAUDE.md rule #2, an unassigned REV poking at a PR they're not on shouldn't learn it exists); ORG_ADMIN callers just need to own the PR's org. `CHANGES_REQUESTED` unconditionally forces status back to `IN_REVIEW` per `api_reference.md`'s auto-transition rule (not routed through `recomputeApprovalStatus`'s threshold logic — it's an override, not a recount). `APPROVED` reviews go through `recomputeApprovalStatus`.
- `packages/pr-service/src/services/version.service.js` — `listVersions`, `getDiff` (using `diffLines` from the `diff` package, diffing `title + description` as one text block since `PRVersion` only stores those two fields and the endpoint contract is a single `{added, removed}` pair).
- `packages/pr-service/src/services/share.service.js` — `createShare`/`listShares`/`revokeShare`, line-for-line the same pattern as ticket-service's `share.service.js` (connection-approved check before creating, revoke-not-hard-delete, active-share-conflict guard), adapted for `PRShare`.
- `packages/pr-service/src/routes/prs.routes.js` — full router. Every `requireRole` call passes `{ allowPlatformAdmin: false }`. Unlike ticket-service, the `GET` routes here (`/`, `/:id`, `/:id/versions`, `/:id/versions/:n/diff`) **do** carry a router-level role gate (`['ORG_ADMIN', 'REVIEWER']`) — SUPPORT_AGENT has zero pr-service visibility "anywhere, including this endpoint" per the user's explicit clarification, which extends to blocking SA even from a legitimate cross-org share (unlike ticket-service, where GUEST access is never role-gated). This was a deliberate, discussed deviation from the ticket-service pattern, not an oversight.
- `packages/pr-service/src/server.js` — rewritten, same shape as ticket-service's (no upload/static middleware needed — PRs have no attachments).
- `packages/pr-service/prisma/seed.js` — 2 PRs (pr1: Alpha, `IN_REVIEW`, `requiredApprovals: 2`; pr2: Beta, `DRAFT`), 1 reviewer assignment, 1 baseline `PRVersion`, 1 `CHANGES_REQUESTED` review, 1 cross-org share (pr1 → Beta) — per the master spec's seed plan, idempotent via `upsert` + fixed local IDs, identical pattern to ticket-service's seed.
- `packages/pr-service/package.json` — added `prisma.seed` config block (was missing).
- **Retrofit, per the user's request while touching this area:** `packages/ticket-service/src/services/ticket.service.js`'s `Ticket.assignedTo` had the identical unvalidated-userId gap pr-service's reviewer-assignment did — any UUID-shaped string was accepted with no check it belonged to a real org member. Added `assertValidAssignee(assignedTo, orgId)` using the same new `getUserOrgRole` check (any non-null role is accepted here, unlike pr-service's stricter "must be exactly REVIEWER" — `api_reference.md` never documented a role restriction for ticket assignment, only that it should be a real org member), wired into both `createTicket` and `updateTicket`.

**Versioning/diff design (not fully specified by `api_reference.md`, resolved by inference from "diffing version n's content against n-1"):** a baseline `PRVersion` #1 is created at the exact moment a PR transitions `DRAFT → IN_REVIEW` (submit for review), snapshotting whatever title/description was just submitted. Every subsequent content edit while `IN_REVIEW` or `APPROVED` creates a new incrementing version snapshotting the *new* content, and updates the live `PullRequest` row to match. This means `GET /versions/1/diff` correctly 400s (`NO_PRIOR_VERSION`) — there's genuinely no version 0 to diff against — while `/versions/2/diff`, `/3/diff`, etc. all work. `DRAFT`-state edits never version at all (update in place, per the table). Verified live end-to-end (see below).

**Status-transition design (also inferred — the table never gave an explicit PATCH body schema for the state machine):** `PATCH /prs/:id` accepts an optional `status` field. Allowed forward transitions: `DRAFT → IN_REVIEW` (submit), `IN_REVIEW → REJECTED`, `APPROVED → REJECTED`, `APPROVED → MERGED`. `REJECTED`/`MERGED` are terminal — no transitions out, and content edits are blocked once there (400 `INVALID_STATE`). `APPROVED → IN_REVIEW` is never caller-driven; it only happens via `recomputeApprovalStatus` (a `CHANGES_REQUESTED` review, or `requiredApprovals` being raised above the current approval count) — deliberately not exposed as a directly settable status value.

**Known audit-enum gap, flagged not silently worked around:** `AuditAction` has `TICKET_DELETED` but **no `PR_DELETED`** — the enum is locked (schema change is out of Phase 4 scope). `deletePR` reuses `PR_STATUS_CHANGED` with explicit `metadata: { from: <lastStatus>, to: 'DELETED' }` as the closest fit, rather than silently skipping the audit call for PR deletion. Flagging for whoever next touches the audit schema — the cleanest real fix is adding `PR_DELETED` to the enum in a future migration.

**Verification (live curl pass, all shown as actual output, not asserted):**
- **Role gating:** `POST /prs` — OA 201, REVIEWER 403, SUPPORT_AGENT 403. `GET /prs` — SUPPORT_AGENT 403, PSA 403 (both confirmed zero pr-service visibility).
- **BOLA, with a manipulated foreign-org ID:** Beta's OA `GET`s pr1 (Alpha's, shared with Beta) → 200 (VIEW access, reviewers/reviews included). Beta's OA `PATCH`es pr1 → 404 (share grants view only, never write — never a 403). Alpha's OA `GET`s a fabricated nonexistent PR id → 404, identical shape to the real-but-inaccessible case.
- **Reviewer-assignment validation (the actual point of this phase's `getUserOrgRole` addition):** assigning a SUPPORT_AGENT as reviewer → 400 `INVALID_REVIEWER`. Assigning a user with no membership in the target org at all → 400 `INVALID_REVIEWER` (confirmed via a direct `GET /internal/users/:id/org-role` call showing `role: null` first, then the same ID rejected by `POST /prs/:id/reviewers` — not just asserted). Re-assigning an already-assigned reviewer → 409 `ALREADY_ASSIGNED`.
- **Auto-transition, both directions, shown live:** with `requiredApprovals: 2` and 1 existing `CHANGES_REQUESTED` review, a REVIEWER's `APPROVED` review → status stays `IN_REVIEW` (1/2). A 2nd `APPROVED` review (from the OA) → crosses the threshold → status auto-flips to `APPROVED`. A subsequent `CHANGES_REQUESTED` review while `APPROVED` → forces back to `IN_REVIEW` regardless of the 2-approval count already on record (per the "regardless of approval count" rule). Re-approving afterward → back to `APPROVED`.
- **Versioning + diff, full cycle:** content edit while `APPROVED` → new `PRVersion` #2 created, live `PullRequest` row updated to match. `GET /versions` shows both. `GET /versions/1/diff` → 400 `NO_PRIOR_VERSION`. `GET /versions/2/diff` → correct `{added, removed}` line arrays.
- **Terminal-state discipline:** `PATCH` status → `MERGED` (from `APPROVED`) → 200. Content edit after `MERGED` → 400 `INVALID_STATE`. `PATCH` status `MERGED → IN_REVIEW` → 400 `INVALID_TRANSITION`.
- **Sharing:** `POST /prs/:id/shares` against an org with no approved connection → 400 `CONNECTION_NOT_APPROVED`.
- **ticket-service retrofit:** `POST /tickets` with a random-UUID `assignedTo` → 400 `INVALID_ASSIGNEE`. Same call with a real Alpha `SUPPORT_AGENT`'s ID → 201.
- All 4 services (`identity`, `ticket`, `pr`, `audit`) confirmed starting cleanly together via direct `node src/server.js` per service (Redis via `docker compose up -d`, Postgres already running locally) — full `npm run dev` fan-out not re-verified this phase but no reason to expect regression (no root-level scripts touched).
- **Post-testing cleanup:** deleted the ad-hoc test PR and test ticket created during this verification pass; restored pr1 back to its seeded `IN_REVIEW` state (undid the MERGED-status/extra-version/extra-reviews churn from walking the full state machine live) and pr2 back to `DRAFT`, so the dev DB matches what a fresh `prisma db seed` run actually produces. Also removed one incidental extra `PRReviewer` row created mid-test (an attempt to assign Beta's reviewer to an Alpha PR that unexpectedly succeeded — turned out to be legitimate stale cross-org membership data from earlier-phase testing, not a bug in this phase's code; see Known issues).

**Files modified:**
- `packages/identity-service/src/services/org.service.js`, `packages/identity-service/src/routes/internal.routes.js` — new `getUserOrgRole` / `GET /internal/users/:userId/org-role`.
- `packages/shared/identityClient.js` — new `getUserOrgRole`.
- `packages/pr-service/src/lib/{prisma,errors}.js` (new), `packages/pr-service/src/services/{pr,reviewer,review,version,share}.service.js` (new), `packages/pr-service/src/routes/prs.routes.js` (new), `packages/pr-service/src/server.js` (rewritten), `packages/pr-service/prisma/seed.js` (new), `packages/pr-service/package.json` (added `prisma.seed` config).
- `packages/ticket-service/src/services/ticket.service.js` — `assertValidAssignee` added, wired into `createTicket`/`updateTicket`.
- `reference/api_reference.md` — updated by the user mid-phase: `POST /prs` role column fixed (OA only), new `GET /internal/users/:userId/org-role` endpoint documented.
- Dev DB: added then removed test PR/ticket rows; pr1/pr2 restored to seeded state (see Verification above); one stray `PRReviewer` row removed.

**Remaining work:** Phase 5 (audit-service) is next. Per the master spec's Phase 5 scope, it must "go back and confirm" pr-service's audit calls (`PR_CREATED`, `PR_STATUS_CHANGED`, `PR_APPROVED`, `PR_CHANGES_REQUESTED`, `PR_MERGED`, `PR_SHARED`, `PR_SHARE_REVOKED`) actually land once the real `POST /internal/audit-events` endpoint exists, same as it must for identity-service's and ticket-service's calls.

**Known issues / TODOs:**
- **No `PR_DELETED` audit action exists** (see "Known audit-enum gap" above) — `deletePR` reuses `PR_STATUS_CHANGED` with `metadata.to: 'DELETED'` as a documented workaround, not a real fix. Revisit if the audit schema is ever migrated again.
- **Same Phase-5-reconciliation flag as Phases 2/3:** `logAudit()`'s swallow-and-warn behavior in `pr.service.js` is still a stopgap, not a decided final design.
- **Stale cross-org test data discovered, not cleaned up (out of this phase's scope):** identity-service's dev DB has `reviewer@beta.test` (user `...0006`) holding an `OrgMembership` in **both** Beta and Alpha (`role: REVIEWER` in each) — leftover from some earlier phase's manual testing (predates Phase 4; not something this phase's seed or code created). Harmless for grading purposes (it's dev-only test debris, not a bug in access-control logic — `getUserOrgRole` correctly reported it as a real membership), but worth a note in case a future demo relies on a clean 2-orgs-2-users-each assumption. Not touched this phase since removing another phase's manually-created test data wasn't asked for and identity-service's membership model has no reason to disallow a user belonging to multiple orgs.
- No automated Jest/Supertest suite added this phase — consistent with Phases 2/3, curl verification only; Phase 6 is where the real test suites get written per `implementation_guide.md`.
- CORS still wide open (unchanged, locked down in Phase 6).

---

## Phase 4 patch — router-level role gate broke cross-org Guest access (2026-07-30)

User caught a real bug in the Phase 4 entry above before Phase 5 started: the router-level `requireRole(['ORG_ADMIN', 'REVIEWER'])` gate on `GET /prs`, `GET /prs/:id`, `GET /prs/:id/versions`, and `GET /prs/:id/versions/:n/diff` ran *before* `resolvePRAccess`'s share-check logic ever got a chance to execute. That meant a legitimate cross-org GUEST — a caller whose PR was validly shared with their org, connection approved and all — got rejected at the router with a flat 403 if their *home-org* role happened to be SUPPORT_AGENT, even though Guest access has nothing to do with the guest's home-org role at all. This is exactly the violation CLAUDE.md's `CROSS_ORG_GUEST` section warns against: guest permission comes from share/connection state, never from a role check. Confirmed live before fixing: `agent@beta.test` (SUPPORT_AGENT) hitting `GET /prs/:id` for pr1 (Alpha's PR, validly shared with Beta) got 403, when it should have been 200 view-only.

**Fix — moved the OA/REV-only restriction from the router into the service, scoped to the OWNER branch only:**
- `packages/pr-service/src/routes/prs.routes.js` — removed the router-level `requireRole` gate entirely from all 4 GET routes, matching ticket-service's pattern exactly (no blanket role gate on reads; access is decided entirely by the service layer).
- `packages/pr-service/src/services/pr.service.js` — `resolvePRAccess`'s `OWNER` branch (own org) now additionally requires `caller.orgRole` to be `ORG_ADMIN` or `REVIEWER`; a SUPPORT_AGENT in the PR's own org still gets no access (falls through to `null` → 404, same as any other non-owning caller — never a 403, since this is a visibility restriction, not a "wrong role for this action" case). The share/`VIEW_COMMENT` branch is completely untouched by this check — a GUEST's home-org role is irrelevant to it, as it always should have been. `listPRs` got the same split: own-org PRs only included if `canSeeOwnOrgPRs` (OA/REV), shared PRs unconditionally included regardless of the caller's home-org role.
- Side effect, not a regression: PSA hitting `GET /prs` now returns `200 { data: [] }` instead of the old router-level 403, since there's no more router gate and `listPRs`'s null-`activeOrgId` short-circuit takes over — this now matches ticket-service's already-established behavior for the identical PSA case (`GET /tickets` has never had a router role gate either), so it's pr-service becoming *more* consistent with the rest of the codebase, not a new inconsistency. No data is disclosed either way.

**Verification, shown live (not asserted):**
- The exact missed case: Beta's SUPPORT_AGENT `GET`s pr1 (Alpha's, shared with Beta) → 200, full view including `reviewers`/`reviews`. Same caller `GET`s `/versions` → 200. Confirms the fix.
- Regression check, same caller: `PATCH pr1` → still 403 (that route is genuinely OA-only per `api_reference.md`, router gate correctly untouched there).
- Regression check: Alpha's own SUPPORT_AGENT (own org, *not* shared with anyone) `GET`s pr1 → 404, not 403 — own-org SA visibility is still correctly blocked, just via the service layer now instead of the router.
- Regression check: Alpha's SUPPORT_AGENT `GET /prs` (list) → `200 { data: [] }` — no own-org PRs (blocked), no shares either, correctly empty rather than erroring.
- No-regression spot checks on unrelated paths: `POST /prs` still 403 for REVIEWER (create stays OA-only, untouched), Beta's OA still 200 on pr1 (share access, unaffected) and still 404 on `PATCH pr1` (view-only via share, unaffected), Alpha's OA still 404 on a fabricated nonexistent PR id.

**Files modified:**
- `packages/pr-service/src/routes/prs.routes.js` — role gate removed from the 4 GET routes, comment explains why.
- `packages/pr-service/src/services/pr.service.js` — `resolvePRAccess`'s OWNER branch and `listPRs` both gained the OA/REV-only own-org check, scoped so it never touches the share/GUEST branch.

**Remaining work:** none — Phase 5 is next.

**Known issues / TODOs:** none new from this patch.

---

## Audit-first mutation ordering (2026-07-30)

CLAUDE.md rule #9 was finalized (no longer an open question): every reportable mutation must call `auditClient.log(...)` **before** the corresponding database write, blocking — if the audit call fails, the mutation aborts with no database write at all. This retires the swallow-and-warn stopgap used throughout Phases 2–4. Achievable cleanly because every resource ID is Prisma-generated client-side (`@default(uuid())` is applied in Prisma Client's JS layer, not by the DB) — so an ID can be minted and included in the audit call before the row that ID belongs to is ever written.

**Built (the minimum needed to unblock this, not full Phase 5 scope):**
- `packages/audit-service/src/lib/{prisma,errors}.js`, `packages/audit-service/src/services/audit.service.js` (`recordEvent`), `packages/audit-service/src/routes/internal.routes.js` (`POST /internal/audit-events`, `internalAuth`-gated, zod-validated against the exact `AuditAction` enum), `packages/audit-service/src/server.js` (rewritten to mount it, standard error-handler shape). **This is a partial, pre-Phase-5 build of audit-service** — only the write path exists. `GET /audit-log`, notifications, the AI digest job, and the `audit_writer` DB-permission lockdown (append-only enforcement) are still full Phase 5 scope, not built here. `packages/audit-service/src/lib/prisma.js` currently connects via `AUDIT_DATABASE_URL` (the owner connection); switching to the restricted `AUDIT_RUNTIME_DATABASE_URL`/`audit_writer` role is a one-line change once Phase 5's `append-only.sql` actually creates that role — flagged inline in the file.
- `packages/shared/auditClient.js` — real implementation. Blocking `fetch` with a 5-second `AbortSignal.timeout` (a hung audit-service must not hang the caller's mutation forever — times out and throws rather than hanging), throws on any non-2xx response or network failure. No more "not implemented" stub.

**Refactored, in all three services that had the Phase 2–4 stopgap — every mutation's write order inverted (audit call first, then the Prisma write), not just re-pointed at a live URL:**
- `packages/identity-service/src/services/connection.service.js` — `requestConnection` (pre-generates the connection's ID via `crypto.randomUUID()`), `respondToConnection`.
- `packages/ticket-service/src/services/{ticket,comment,attachment,share}.service.js` — `createTicket`, `updateTicket`, `deleteTicket`, `createComment`, `createAttachment` (also moved the **file write** to disk after the audit call, not just the DB row — an audit failure after the file was already written would reproduce the exact orphaned-file bug Phase 3 found and fixed once already, just triggered by a different failure mode), `createShare`, `revokeShare`.
- `packages/pr-service/src/services/{pr,review,share}.service.js` — `createPR`, `updatePR`'s status-transition branch, `recomputeApprovalStatus` (both its APPROVED and fall-back-to-IN_REVIEW branches), `deletePR`, `submitReview`'s `CHANGES_REQUESTED` path, `createShare`, `revokeShare`. `updatePR`'s in-place content edits and `PRVersion` creation are unchanged — no `AuditAction` enum value covers them (pre-existing Phase 4 design call, not something this refactor's scope covers), so there's no audit gate to reorder there. `reviewer.service.js`'s `addReviewer` similarly untouched (no enum value for it either).
- Every service's `logAudit()` helper simplified from a try/catch-and-`console.warn` wrapper to a thin pass-through (`return auditClient.log(event)`) — letting the throw propagate up to the route handler's existing `catch (err) { next(err) }` *is* the abort; no new error-handling code was needed since the generic 500 path in each service's error middleware already existed.

**Real bug this refactor surfaced and fixed immediately, not deferred:** `connection.service.js`'s `respondToConnection` logged `orgId: caller.activeOrgId`. That's `null` for a PSA caller (no `OrgMembership` exists for PSAs by design, same fact Phase 3 already ran into once for ticket-service's null-`activeOrgId` guard) — under the old swallow-and-warn behavior this silently never mattered, but under blocking audit calls it would have hard-failed *every* PSA connection approval/revocation with a zod validation error (`orgId` must be a UUID), since PSA approving/revoking connections is an explicitly legitimate, tested capability (Phase 3 patch round 2). Fixed by logging `connection.requesterOrgId` instead — matches `requestConnection`'s existing convention of logging from the requesting org's perspective, and is never null.

**Verification, exactly as requested, shown live:**
- Alpha's ticket count confirmed at 2 (baseline) before the test.
- audit-service stopped. `POST /tickets` as Alpha's OA → `500 Internal Server Error`, ~1.4s (the `AbortSignal.timeout`'s 5s ceiling wasn't hit — `fetch` failed fast on connection refused). `ticket-service`'s log shows the real cause: `Error: auditClient.log() failed — audit-service unreachable: fetch failed`, thrown from `ticket.service.js`'s `createTicket` before any `prisma.ticket.create` call. Alpha's ticket count re-checked directly via Prisma afterward: still 2 — **no ticket was created.**
- audit-service restarted. Identical `POST /tickets` call → `201`, ticket returned with a real ID. Fetched that exact ticket row directly via Prisma → exists. Fetched the matching `AuditLog` row by `entityId` → exists, `action: TICKET_CREATED`, and its `createdAt` (06:09:32.266Z) is provably earlier than the ticket row's own `createdAt` (06:09:32.821Z) — direct evidence the audit write really did happen first, not just that both happened to succeed.
- Additionally smoke-tested `POST /prs` (pr-service) with audit-service up → `201`, same pattern confirmed working end-to-end for the second refactored service.
- Test ticket, test PR, and their audit rows deleted afterward to leave the dev DB clean.

**Files modified:**
- `packages/audit-service/src/lib/{prisma,errors}.js` (new), `packages/audit-service/src/services/audit.service.js` (new), `packages/audit-service/src/routes/internal.routes.js` (new), `packages/audit-service/src/server.js` (rewritten).
- `packages/shared/auditClient.js` — real implementation.
- `packages/identity-service/src/services/connection.service.js` — `logAudit` simplified; `requestConnection`/`respondToConnection` reordered; `respondToConnection`'s `orgId` bug fixed.
- `packages/ticket-service/src/services/{ticket,comment,attachment,share}.service.js` — `logAudit` simplified (in `ticket.service.js`); all mutations reordered.
- `packages/pr-service/src/services/{pr,review,share}.service.js` — `logAudit` simplified (in `pr.service.js`); all mutations reordered.
- Dev DB: one test ticket, one test PR, and their audit rows created then deleted during verification.

**Remaining work:** Phase 5 proper — `GET /audit-log` (with filters, CSV export, server-forced `orgId`), notifications (`Notification` model already exists from Phase 1; `GET /notifications`, `PATCH /notifications/:id/read` routes don't exist yet), the AI digest `node-cron` job, and the `audit_writer` role's actual `GRANT`/`REVOKE` SQL (append-only DB-permission enforcement — `packages/audit-service/src/lib/prisma.js` is ready for the one-line datasource switch once that SQL runs).

**Known issues / TODOs:**
- `audit-service`'s Prisma client still connects via the owner role (`AUDIT_DATABASE_URL`), not yet the restricted `audit_writer` role — append-only is not yet DB-permission-enforced, only application-level (no `UPDATE`/`DELETE` code path exists, but nothing stops a direct `psql` connection from doing either). Full Phase 5 scope.
- No automated test for the audit-first ordering yet (this was verified manually, live, per the user's explicit request) — Phase 6's `audit-permissions.test.js` and the broader test suite should codify this.

---

## Audit-first mutation ordering — two follow-up fixes (2026-07-30)

User caught two real gaps in the audit-first refactor above before Phase 5 continued.

**1. Audit-call failures were falling through to a bare `500 Internal Server Error`, not a distinguishable response.** `auditClient.log()` threw a plain `Error`, which every service's error handler's generic `catch-all` branch turned into `{error: {message: 'Internal server error', code: 'INTERNAL_ERROR'}}` at 500 — indistinguishable from an actual unhandled bug. Fixed by giving `auditClient.js` a dedicated `AuditLogError` class (`statusCode: 503`, `code: 'AUDIT_LOG_FAILED'`), thrown from both of `log()`'s failure paths (unreachable audit-service, non-2xx response). Added an `err instanceof auditClient.AuditLogError` branch to all three calling services' error handlers (`identity-service`, `ticket-service`, `pr-service` — `audit-service` itself never calls `auditClient.log()`, so it didn't need this). Verified live: with audit-service stopped, `POST /tickets` now returns `503 {"error":{"message":"Audit log write failed — audit-service unreachable: fetch failed","code":"AUDIT_LOG_FAILED"}}`, not a bare 500.

**2. `respondToConnection`'s `orgId` fix from the original refactor was wrong for the normal (non-PSA) case.** The original fix used `connection.requesterOrgId` unconditionally, reasoning only about the PSA null-`activeOrgId` case — but that meant every *real* OA approval/revoke got attributed to the requesting org's audit log, never the approving org's, even though the approving org is very often a different, real org with its own `caller.activeOrgId`. Concretely: Beta's OA approving a connection Alpha requested would log `orgId: Alpha`, so it would never show up under `GET /audit-log` filtered to Beta's own org — exactly backwards from what an org admin reviewing their own audit trail would expect. Fixed to `orgId: caller.activeOrgId || connection.requesterOrgId` — uses the caller's own org whenever they have one (every real OA case, either side of the connection), falling back to `connection.requesterOrgId` only when `caller.activeOrgId` is genuinely null (PSA specifically, which is the only case the fallback is actually for).

**Verification, shown live:**
- Fix 1: confirmed audit-service down (`netstat` showed nothing on 4004), then `POST /tickets` as Alpha's OA → `503`, exact body `{"error":{"message":"Audit log write failed — audit-service unreachable: fetch failed","code":"AUDIT_LOG_FAILED"}}`.
- Fix 2: revoked the existing Alpha→Beta connection, had Alpha request a fresh one, then had **Beta's OA** (not Alpha's) approve it. Fetched the resulting `CONNECTION_APPROVED` audit row directly via Prisma by `entityId` → `orgId: '00000000-0000-0000-0000-0000000be7a0'` (Beta), not Alpha's `...a1fa0` — confirms the entry is attributed to the approving org, not always the requester.
- Dev DB left in the same functional end state (Alpha↔Beta connection `APPROVED`) — the revoke/re-request/re-approve cycle used for the test was a wash, not a net change.

**Files modified:**
- `packages/shared/auditClient.js` — new `AuditLogError` class, thrown from both failure paths in `log()`.
- `packages/identity-service/src/server.js`, `packages/ticket-service/src/server.js`, `packages/pr-service/src/server.js` — added the `AuditLogError` branch to each error handler.
- `packages/identity-service/src/services/connection.service.js` — `respondToConnection`'s audit `orgId` changed from unconditional `connection.requesterOrgId` to `caller.activeOrgId || connection.requesterOrgId`.
- Dev DB: one `OrgConnection` revoked and a fresh one requested/approved in its place during verification (net: still `APPROVED`, same org pair).

**Remaining work:** none — Phase 5 proper (GET /audit-log, notifications, AI digest, `audit_writer` DB lockdown) is next.

**Known issues / TODOs:** none new from this patch.

---

## Phase 5 — Audit Service: Append-Only Enforcement, Unified Viewer, Notifications, AI Digest (2026-07-30)

**Status:** complete

**Four real gaps flagged and resolved with the user before writing code, per CLAUDE.md rule #11:**

1. **No way for the AI digest job to enumerate users.** identity-service only ever had single-member CRUD (POST/PATCH/DELETE), no GET list. Resolved: added `GET /internal/org-members?orgId=` (optional — all memberships across all orgs if omitted) to identity-service. Each returned membership row is treated as one independent unit of digest generation — a user in 2 orgs gets 2 separate digest computations and 2 separate `Notification` rows, **never** a combined cross-org digest in one prompt. This was the user's explicit instruction, specifically to keep the leakage boundary unambiguous for Phase 6's `ai-leakage.test.js`.
2. **No internal endpoints in ticket-service/pr-service for per-user aggregate facts.** Resolved: one narrow facts endpoint per service — `GET /internal/facts/tickets?userId=&orgId=` → `{assignedCount, overdueCount}` and `GET /internal/facts/prs?userId=&orgId=` → `{awaitingReviewCount, oldestIdleHours}` (`oldestIdleHours: null`, not `0`, when nothing is awaiting review — a real "caught up" result, not a missing value). Both internal-API-key gated, both documented in `api_reference.md`, both with matching `packages/shared` client wrappers (`ticketClient.js`, `prClient.js`) following `identityClient.js`'s existing fail-closed pattern — but returning `null` for the *whole result* on failure (not zeros), so the digest job can tell "the call failed" apart from "the answer really is zero."
3. **Ticket has no due-date field**, so "overdue" (the assignment's own example digest text: "1 overdue") can't be computed literally. Resolved: heuristic — a ticket counts as overdue if it's still `OPEN`/`IN_PROGRESS` and was created more than `TICKET_OVERDUE_THRESHOLD_DAYS` days ago (new env var, default 3). Documented as an approximation both inline at the computation (`ticket-service/src/services/facts.service.js`) and flagged here for `docs/known-limitations.md` at Phase 9 — not a literal due-date comparison.
4. **`GROQ_MODEL` was deprecated.** Web search at build time (per `implementation_guide.md`'s explicit "verify exact model string against Groq's docs at build time" instruction) confirmed Groq deprecated `llama-3.3-70b-versatile` on 2026-06-17 — about 6 weeks before this phase was built. Updated the default in `.env.example` and local `.env` to `openai/gpt-oss-120b`, Groq's own migration recommendation. Also gets automatic prompt caching on Groq, worth a mention in the cost-justification section of `docs/known-limitations.md` at Phase 9 given the digest job's repeated system-prompt structure across users/orgs.

**1. Append-only enforcement — verified first, before building anything else this phase, per the user's explicit ordering:**
- `packages/audit-service/prisma/append-only.sql` (new) — idempotent `CREATE ROLE audit_writer` (guarded, skips if it already exists) + `GRANT USAGE ON SCHEMA audit` + `GRANT SELECT, INSERT ON "AuditLog"` + `REVOKE UPDATE, DELETE ON "AuditLog"` (from `audit_writer` **and** `PUBLIC`) + `GRANT SELECT, INSERT, UPDATE ON "Notification"`. The append-only restriction is specific to `AuditLog`, not a blanket "this role can never UPDATE anything" — `Notification` has real update behavior (`PATCH /notifications/:id/read`) and needs it. Applied directly against the local Postgres instance via `psql` as the owner role.
- `packages/audit-service/src/lib/prisma.js` — switched from the owner connection (`AUDIT_DATABASE_URL`) to the runtime connection (`AUDIT_RUNTIME_DATABASE_URL`, which authenticates as `audit_writer`).
- **Verified live, with real mutation traffic actually flowing through the role, not just that it exists on paper:** started audit-service (now connected as `audit_writer`), sent a real `POST /internal/audit-events` through the running app → `201`, row actually inserted. Then, connected directly via `psql -U audit_writer` and ran the exact rejection proof against that real row:
  ```
  == Connected as audit_writer — attempt UPDATE against audit."AuditLog" ==
  ERROR:  permission denied for table AuditLog
  == Attempt DELETE against audit."AuditLog" ==
  ERROR:  permission denied for table AuditLog
  == Confirm SELECT still works (INSERT+SELECT retained) ==
                    id                  |     action     |           metadata
  --------------------------------------+----------------+-------------------------------
   655b3506-e837-4a1c-9099-6ad4b8642545 | TICKET_CREATED | {"test": "append-only-proof"}
  ```
  Both `UPDATE` and `DELETE` rejected at the DB permission level with a real Postgres `permission denied` error, `SELECT` and the app's own `INSERT` (already proven by the successful `201` above) both still work. Test row deleted afterward via the owner connection (the only connection that still can).

**2. Unified Audit Viewer:**
- `packages/audit-service/src/services/auditLog.service.js` (new) — `queryAuditLog(caller, {userId, from, to, action})`: `orgId` is **always** `caller.activeOrgId`, forced server-side, never read from any query param — same BOLA discipline as every ticket/PR read endpoint, applied here to an aggregation query instead of a single-resource lookup. `userId` (if given) filters by `actorId`. `toCsv(rows)` serializes `queryAuditLog`'s exact returned rows — **one query path**, not a second parallel one that could drift (per the user's explicit requirement). Dates serialize as ISO 8601 in the CSV, not JS's locale-dependent `Date#toString()`.
- `packages/audit-service/src/routes/auditLog.routes.js` (new) — `GET /audit-log`, `requireRole(['ORG_ADMIN', 'REVIEWER'], { allowPlatformAdmin: false })` (matches `api_reference.md`'s table exactly — PSA excluded, same explicit-opt-out pattern locked since Phase 3/4). zod validates `action` against the same `AUDIT_ACTIONS` list used by the write path (extracted to `lib/auditActions.js` so both routes share one source of truth), and `from`/`to` against a custom `Date.parse`-based check (zod's built-in `.datetime()` was too strict — it rejects a bare date like `2026-07-01`, which is a reasonable query value).
- Verified live: OA → 200; SUPPORT_AGENT → 403; PSA → 403 (no ticket/PR/audit visibility, consistent with the rest of the codebase). Alpha's OA passing `?orgId=<Beta's ID>` as a bogus query param → response still scoped to Alpha only (server-side force confirmed, injected param ignored). `?format=csv` → correct `Content-Type: text/csv`, `Content-Disposition: attachment`, ISO-8601 dates. `?action=`, `?userId=`, `?from=&to=` all filter correctly; an invalid `action` value → clean 400, not a Prisma enum error.

**3. Notifications:**
- `Notification` model already existed in `schema.prisma` from Phase 1 — no migration needed.
- `packages/audit-service/src/services/notification.service.js` (new) — `listNotifications` (own only, unread-first via `orderBy: [{read: 'asc'}, {createdAt: 'desc'}]`), `markRead` (own only — a notification that exists but belongs to someone else is 404, not 403, same discipline as every other own-resource check), `createDigestNotification` (used internally by the digest job, not a route).
- `packages/audit-service/src/routes/notifications.routes.js` (new) — `GET /notifications`, `PATCH /notifications/:id/read`, both just `authenticate` (no role gate — "ANY (own only)" per the table).
- Verified live: created a real digest notification (see below), confirmed it appears via `GET /notifications`; Beta's OA attempting to mark Alpha's notification as read → 404; Alpha's OA marking their own → 200, `read: true`.

**4. AI Digest:**
- `packages/audit-service/src/lib/groqClient.js` (new) — `openai` npm package (the "OpenAI-compatible client" the spec asks for) pointed at Groq's `https://api.groq.com/openai/v1` base URL, model from `GROQ_MODEL`.
- `packages/audit-service/src/services/digest.service.js` (new) — `buildDigestPrompt({ticketFacts, prFacts})`: a **pure function**, exported specifically so Phase 6's `ai-leakage.test.js` can call it directly and assert on the exact prompt string, rather than reverse-engineering it from a mocked Groq call's arguments (per the user's explicit ask: "build it so that test has something real to assert against, not something to reverse-engineer later"). Takes only the two facts objects — no `userId`, no `orgId`, no raw rows, nothing beyond the numbers ticket-service's/pr-service's own internal facts endpoints already scoped before this function ever saw them. `generateDigestForMembership({userId, orgId})`: fetches both facts in parallel, skips (logs a warning, returns `null`) if either fetch failed — never fabricates a "0" when the real answer is unknown. `runDigestCycle()`: enumerates every membership via `identityClient.getOrgMembers()`, generates one independent digest per row, catches and logs per-row failures so one user's failure never blocks the rest of the cycle.
- `packages/audit-service/src/scheduler.js` (new) — `node-cron`, interval from `AI_DIGEST_INTERVAL_HOURS` converted to an hourly cron expression (`0 */${hours} * * *`). Started from `server.js` after `app.listen` succeeds. No public trigger endpoint, per `api_reference.md`.
- **Verified live, with a real Groq call, not mocked:** manually invoked `generateDigestForMembership` for Alpha's OA (who has 0 assigned tickets, 0 awaiting-review PRs) → real Groq response ("Great news—there are no tickets or pull requests awaiting your action right now...") stored as a real `Notification` row, confirmed visible via `GET /notifications`.
- **Verified the 2-orgs-2-digests requirement specifically**, using a leftover multi-org test user from earlier-phase testing (`reviewer@beta.test`, who also has a stray `REVIEWER` membership in Alpha from Phase-2-era manual testing): generated a digest for `(user, Beta)` and a separate digest for `(user, Alpha)` — 2 distinct `Notification` rows, each with only that org's facts. One call hit a transient Groq API blip ("Groq returned no completion text") on the first attempt; confirmed this was correctly handled as a per-user skip (logged a warning, didn't crash), then succeeded cleanly on retry — direct evidence the resilience design works, not just that it exists in the code.
- Directly unit-verified `buildDigestPrompt`'s output contains only the injected numbers — no IDs, emails, or org names — confirming it's a clean, leak-free function for Phase 6 to build on.
- Verified test artifacts (3 digest notifications, 1 audit-events test row) cleaned up afterward via the owner DB connection — `audit_writer` correctly has no `DELETE` grant on either table (by design; no route ever deletes an `AuditLog` or `Notification` row, so none was granted), which is itself a nice confirmation of least-privilege working as intended, not an oversight.

**Files modified:**
- `packages/audit-service/prisma/append-only.sql` (new), `packages/audit-service/src/lib/prisma.js` (switched datasource to `audit_writer`).
- `packages/identity-service/src/services/org.service.js` (`getOrgMembers`), `packages/identity-service/src/routes/internal.routes.js` (`GET /internal/org-members`).
- `packages/shared/identityClient.js` (`getOrgMembers`), `packages/shared/ticketClient.js` (new, `getTicketFacts`), `packages/shared/prClient.js` (new, `getPRFacts`), `packages/shared/index.js` (exports both new clients).
- `packages/ticket-service/src/services/facts.service.js` (new), `packages/ticket-service/src/routes/internal.routes.js` (new), `packages/ticket-service/src/server.js` (mounts it).
- `packages/pr-service/src/services/facts.service.js` (new), `packages/pr-service/src/routes/internal.routes.js` (new), `packages/pr-service/src/server.js` (mounts it).
- `packages/audit-service/src/lib/{auditActions,groqClient}.js` (new), `packages/audit-service/src/services/{auditLog,notification,digest}.service.js` (new), `packages/audit-service/src/routes/{auditLog,notifications}.routes.js` (new), `packages/audit-service/src/routes/internal.routes.js` (refactored to import `AUDIT_ACTIONS` from `lib/auditActions.js` instead of a local copy), `packages/audit-service/src/scheduler.js` (new), `packages/audit-service/src/server.js` (mounts everything, starts the scheduler), `packages/audit-service/package.json` (added `openai`, `node-cron`).
- `.env.example`, `.env` — `GROQ_MODEL` updated to `openai/gpt-oss-120b`; new `TICKET_OVERDUE_THRESHOLD_DAYS=3`.
- `reference/api_reference.md` — added `GET /internal/org-members?orgId=` (identity-service), `GET /internal/facts/tickets?userId=&orgId=` (ticket-service), `GET /internal/facts/prs?userId=&orgId=` (pr-service); updated the AI Digest section to describe the actual enumeration/facts/model flow and the Groq model change.
- Dev DB: one `AuditLog` test row and 3 `Notification` test rows created then deleted during verification.

**Remaining work:** Phase 6 (Security Hardening & Automated Tests) is next — the CORS allowlist lockdown, a full re-audit of every raw `where` query for missing org filters, and the 5 required Jest/Supertest suites, including `ai-leakage.test.js` (which now has `buildDigestPrompt` as a directly-callable, pure target) and `audit-permissions.test.js` (which now has real `audit_writer` behavior to codify, not just this phase's manual `psql` proof).

**Known issues / TODOs:**
- "Overdue" ticket count is a heuristic (`TICKET_OVERDUE_THRESHOLD_DAYS`), not a literal due-date comparison — Ticket has no due-date field in this schema. Flag for `docs/known-limitations.md` at Phase 9.
- "Awaiting this user's review" (pr-service facts) is defined as "assigned + IN_REVIEW + no review yet from this user" — a judgment call about the review workflow's actual semantics, not explicitly specified in `api_reference.md`. Reasonable given the state machine, but worth a second look if a future phase's frontend surfaces this number somewhere users might scrutinize closely.
- `GROQ_MODEL`'s deprecation was caught by an explicit web search at build time per `implementation_guide.md`'s instruction — worth remembering to re-check at Phase 9 in case Groq deprecates the replacement too before submission.
- No automated Jest/Supertest suite added this phase — consistent with Phases 2-4, live verification only (including a real, unmocked Groq call). Phase 6 is where the real test suites, including the mocked-Groq `ai-leakage.test.js`, get written.
- `docs/known-limitations.md` should get: the overdue-threshold heuristic, the `openai/gpt-oss-120b` prompt-caching note (cost-justification angle), and the multi-org stray-membership dev-DB debris noted in Phase 4's entry — none added yet since that file is explicitly Phase 9 scope.

---

## Phase 5 patch — Notification grants, batch resilience, and enumeration re-verified with explicit rigor (2026-07-30)

User asked for three specific re-confirmations before Phase 6, each with actual output shown, not "confirmed" asserted. All three checked out — no code changes were needed, only verification (plus a minor cleanup).

**1. `audit_writer`'s exact grants on `Notification`, shown directly from Postgres:**
```
   grantee    | table_schema |  table_name  | privilege_type
--------------+--------------+--------------+----------------
 audit_writer | audit        | AuditLog     | INSERT
 audit_writer | audit        | AuditLog     | SELECT
 audit_writer | audit        | Notification | INSERT
 audit_writer | audit        | Notification | SELECT
 audit_writer | audit        | Notification | UPDATE
```
(`SELECT ... FROM information_schema.role_table_grants WHERE grantee = 'audit_writer'`.) Confirms `append-only.sql`'s `Notification` grant (written in the same file as the `AuditLog` restriction, before this patch, so nothing was actually missing) — `AuditLog` really is SELECT+INSERT only, `Notification` really does have UPDATE too. Then proved it live through the actual running app (which connects as `audit_writer` via `AUDIT_RUNTIME_DATABASE_URL`, not the owner): generated one real digest notification (`audit_writer` INSERT), then `GET /notifications` (`audit_writer` SELECT) → 200 with the row; `PATCH /notifications/:id/read` (`audit_writer` UPDATE) → 200, `read: true`; re-fetched to confirm the update actually persisted, not just returned. Test row deleted afterward via the owner connection.

**2. Batch resilience under a forced mid-cycle failure — actually tested, not just re-read from the code.** Built a throwaway script (`scratch_resilience_test.js`, deleted after use) that monkey-patched `identityClient.getOrgMembers` to return 3 controlled `(userId, orgId)` rows and `groqClient.generateDigest` to throw on exactly the 2nd call, then ran the real `runDigestCycle()`. Result: the cycle logged `"skipping digest for user ...002 ... Groq call failed: SIMULATED transient Groq failure"` and continued — user 1 and user 3 both got real `Notification` rows (confirmed via a direct Prisma query afterward), user 2 correctly got none, and `runDigestCycle()` itself returned normally rather than throwing. This wasn't a design change — `generateDigestForMembership`'s internal try/catch around the Groq call (returns `null` rather than propagating) already made this correct from when it was first built, and `runDigestCycle`'s per-row try/catch is defense-in-depth on top of that — but it had only been inferred from reading the code plus one real (unforced) transient failure during Phase 5's own testing, never deliberately forced and inspected end-to-end until now. Test notifications deleted afterward.

**3. Enumeration confirmed to go through the real `GET /internal/org-members` endpoint, not an in-process shortcut.** Two-part proof: (a) `digest.service.js`'s `runDigestCycle` literally calls `identityClient.getOrgMembers()` — no alternate path exists. (b) Live network proof: tailed identity-service's own log while calling `identityClient.getOrgMembers(...)` from a separate process, and watched the real access-log line appear: `GET /internal/org-members?orgId=... 200 3.493 ms - 476` — confirming the shared client wrapper actually makes an HTTP round-trip to that exact documented endpoint, not a direct DB read or a mocked/stubbed path.

**Files modified:** none — this was a verification-only patch. `scratch_resilience_test.js` was created and deleted within the same session, never committed.

**Remaining work:** none — Phase 6 is next, unchanged from Phase 5's own "Remaining work" note.

**Known issues / TODOs:** none new from this patch.

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
