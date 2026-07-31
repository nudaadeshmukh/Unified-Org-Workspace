# Implementation Guide — Froncort Unified Org Workspace

Phase-by-phase blueprint. Build exactly what the current phase specifies — not ahead of it, not behind it. Endpoint contracts are in `reference/api_reference.md`; frontend design system is in `reference/frontend_reference.md`; project-wide rules that apply to every phase are in `CLAUDE.md` (repo root). This document does not repeat those rules per phase except where a phase adds a new one for the first time.

Each phase includes: Goal, Scope, Detailed requirements, Explicit non-goals (deliberately deferred), Definition of done.

**Standing requirement, every phase, no exceptions:** as the last step of the phase — after the code itself works, not before — update `docs/project-progress.md` with four sections for this phase: Completed features, Files modified, Remaining work, Known issues/TODOs. Append to the running log; never overwrite a previous phase's entry. This is what lets a fresh Claude Code session pick up the project without the user re-explaining what already exists — treat it as part of the phase's definition of done, not an optional extra.

**Also standing, every phase:** `CLAUDE.md`'s Reliability Rules and Local Development Environment sections apply throughout, not just Phase 1 — in particular, Postgres always means the local installation (never a Docker container) and `docker-compose.yml` never grows a Postgres service, even if a later phase seems to want one for convenience.

---

## Phase 1 — Project Foundation

**Goal:** entire project skeleton compiles and runs. Nothing functional yet.

**Scope:**
- npm-workspaces monorepo per the folder structure in `CLAUDE.md`.
- All 4 backend services (`identity-service`, `ticket-service`, `pr-service`, `audit-service`): `package.json`, `tsconfig`/plain JS setup, `src/server.js` with a bare Express app (helmet, cors, morgan, JSON body parsing wired but not configured with real allowlists yet), a `/health` route each, `.env.example`.
- `packages/shared`: folder structure and empty/stub exports for `jwt.js`, `orgScope.js`, `auditClient.js`, `middleware/authenticate.js`, `middleware/requireRole.js`, `middleware/internalAuth.js` — signatures defined, real logic comes in Phase 2+.
- All 4 Prisma schemas written in full (as specified in the master spec / ERD), migrations generated and applied against the developer's **local** Postgres installation (`localhost:5432` — not a Docker container), one schema each.
- `docker-compose.yml` containing **only** a Redis service (no Postgres service — see `CLAUDE.md` → Local Development Environment), root `.env.example` aggregating all services' variables.
- Two Next.js apps (`frontend/apps/support-hub`, `frontend/apps/review-console`) with Tailwind configured, a landing/login page shell (no real auth wired), and an empty dashboard shell per app.
- `frontend/packages/ui` created with just a placeholder Button/Card component — real component library comes in Phase 7.
- Root `package.json` scripts: `dev`, `prisma:migrate`, `prisma:generate` (per earlier design).
- Create `docs/project-progress.md` using the template structure (see the standing requirement above) with a Phase 1 entry as the first log — this establishes the file every later phase appends to.

**Non-goals:** no real auth, no real business logic anywhere, no real UI beyond a shell. Do not write route logic beyond a `/health` check.

**Definition of done:** `npm install && npm run dev` starts all 4 backend services and both frontend apps without errors. `npm run prisma:migrate` succeeds against a local Postgres. Landing pages render.

---

## Phase 2 — Identity Service: Auth, Org Management, RBAC, Org Switcher, Session Sync, Cross-Org Connections

**Goal:** the entire identity layer works end-to-end and is independently testable via curl/Postman before any other service depends on it.

**Scope (see `api_reference.md` → identity-service for exact contracts):**
- `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/switch-org`, `/auth/session` (logout), `/auth/me`.
- RS256 keypair generation via `scripts/generate-jwt-keys.sh`; identity-service signs. **Distribution is locked: both keys are injected as env vars (`JWT_PRIVATE_KEY` for identity-service only, `JWT_PUBLIC_KEY` for all 4 services), base64-encoded PEM strings — not a shared file path and not an internal endpoint.** This was previously left open in this guide; it's now decided because a file path breaks once services are on separate Railway hosts with no shared filesystem.
- Refresh token: opaque string in Redis (`refresh:<token> → userId`), `httpOnly`/`Secure` cookie, rotated on every `/auth/refresh` call, with reuse-of-rotated-token detection revoking the whole session (delete all Redis state for that user's session).
- `packages/shared/jwt.js`: real `sign()` (identity-service only) and `verify()` (all services) implementations now.
- `packages/shared/middleware/authenticate.js`: real implementation — verifies JWT, attaches `req.user = {id, activeOrgId, orgRole, isPlatformAdmin}`.
- `packages/shared/middleware/requireRole.js`: real implementation.
- Org management endpoints: `/orgs/:id`, `/orgs/:id/members` (POST/PATCH/DELETE).
- Cross-org connection endpoints: `/orgs/:id/connections` (POST/GET), `/connections/:id` (PATCH) — full state machine (PENDING → APPROVED/REVOKED, no direct re-approval after revoke). **`auditClient.log(...)` calls required on all three transitions** (`CONNECTION_REQUESTED`, `CONNECTION_APPROVED`, `CONNECTION_REVOKED`) — this was missing from an earlier draft of this phase; audit-service doesn't exist yet at this point in the build, so stub the HTTP call gracefully (same pattern Phase 3/4 use), and confirm it actually works end-to-end once Phase 5 builds the real receiving endpoint.
- **Verify explicitly:** can two orgs re-establish a connection in the same direction after a prior connection between them was revoked? The unique constraint is on the `(requesterOrgId, partnerOrgId)` pair — if `connection.service.js` attempts a plain insert for a repeat same-direction request, it will collide with the existing (revoked) row. Either the service must find-and-reset an existing row back to `PENDING` when re-requested in the same direction, or the unique constraint needs to become a partial index (unique only where `status IN ('PENDING','APPROVED')`) so history can have multiple rows for the same pair over time. Resolve and document whichever approach is taken before Phase 3.
- Internal endpoint: `/internal/connections/status` for other services to check.
- `packages/shared/middleware/internalAuth.js`: real implementation, checks `X-Internal-Api-Key` header.
- Rate limiting on `/auth/login` (express-rate-limit). **Locked threshold: 5 attempts per 15 minutes, keyed by IP + email combined** (not IP alone, so one attacker can't lock out a legitimate user's email by spraying from many IPs, and one shared-IP office can't accidentally lock everyone out). Return 429 with a plain `{error: {message, code: 'RATE_LIMITED'}}` body, no retry-after leakage of internal state.
- bcrypt password hashing (cost 10–12).
- zod validation on every route body in this service.
- `identity-service`'s `seed.ts`: 2 orgs, users across all roles, 1 approved connection — per the master spec's seed plan. **Locked: Platform Super Admin is seed-only.** There is no in-app registration, promotion, or invite path to `isPlatformAdmin: true` — `/auth/register` always produces a regular `ORG_ADMIN` of a new org, never a PSA. The one PSA account exists solely because the seed script sets the flag directly. Do not add a promotion endpoint even if it seems convenient for testing.

**Non-goals:** no ticket/PR logic. No frontend wiring beyond what's needed to manually test via API client — real login/org-switcher UI comes in Phase 7/8.

**Definition of done:** register → login → refresh → switch-org → logout-everywhere all work via curl/Postman. Reusing an old refresh token after a new one was issued fails and kills the session. A connection can be requested, approved, and revoked, and re-approval after revoke requires a new request. Seed script runs cleanly on a fresh DB.

---

## Phase 3 — Support Hub Backend (ticket-service)

**Goal:** full ticket-service functionality, independently testable, correctly enforcing org isolation and cross-org sharing against identity-service.

**Scope (see `api_reference.md` → ticket-service):**
- Ticket CRUD, comments, attachments. **Locked storage mechanism:** files are saved to a per-service `packages/ticket-service/uploads/` directory (gitignored — add `uploads/` to `.gitignore` in this phase), served via `express.static` at `/uploads/:filename`. `Attachment.fileUrl` stores that relative path (e.g. `/uploads/<uuid>-<originalname>`), not an absolute URL. Known limitation to carry into `docs/known-limitations.md` at Phase 9: Railway's container filesystem is ephemeral, so uploaded files won't survive a redeploy — acceptable for this assignment's timeline, not for real production use.
- `packages/shared/orgScope.js`: real implementation now — this is the actual BOLA defense, used by every route here.
- **PSA does not bypass anything in this service.** Every `requireRole(...)` call here must pass `{ allowPlatformAdmin: false }` — see `CLAUDE.md` → Platform Super Admin scope. Do not build a separate/local role-gate implementation for this service; the shared `requireRole()` middleware should take the bypass behavior as an explicit parameter so identity-service and ticket-service both use the one implementation correctly, rather than diverging.
- Feature flags: `GET /orgs/:orgId/feature-flags` (reads seeded rows).
- Cross-org ticket sharing: `POST/GET/DELETE /tickets/:id/shares` — must call identity-service's `/internal/connections/status` before creating a share.
- The 5-step cross-org permission check from the master spec (own org → share exists → not revoked → connection still APPROVED → view+comment only) implemented as one reusable function, unit-testable directly (not just through HTTP).
- `auditClient.log(...)` calls on every mutation (ticket create/update/delete/share/unshare, comment added, attachment added) — see `api_reference.md`'s action list. audit-service doesn't need to be built yet; stub the HTTP call or point it at a not-yet-existing endpoint and handle the failure gracefully for now (real audit-service arrives Phase 5 — note this explicitly as a temporary gap, not silently swallowed).
- `ticket-service`'s `seed.ts` per the master spec's seed plan (3 tickets, 1 comment, 2 feature flags, 1 cross-org share).

**Non-goals:** no PR logic, no real audit-service yet (see note above), no frontend.

**Definition of done:** an Org Admin/Support Agent can fully CRUD tickets in their own org. A manipulated foreign-org ticket ID returns 404. A shared ticket is visible (view+comment only) to the partner org and to no other resource in the sharing org. Revoking the underlying connection removes access even if the share row still exists.

---

## Phase 4 — Review Console Backend (pr-service)

**Goal:** full pr-service functionality, mirroring ticket-service's isolation discipline exactly.

**Scope (see `api_reference.md` → pr-service):**
- PR CRUD with the DRAFT/IN_REVIEW/APPROVED/REJECTED/MERGED state machine.
- Reviewer assignment, approval submission, auto-transition logic (N-approvals rule, changes-requested override). **Reviewer role must be verified server-side, not trusted from the request body** — add `GET /internal/users/:userId/org-role?orgId=` to identity-service (new in this phase, documented in `api_reference.md`) and a matching `getUserOrgRole()` function in `packages/shared/identityClient.js`; `POST /prs/:id/reviewers` must call it and reject if the target user's role isn't `REVIEWER` in that org.
- **Related gap worth checking while this endpoint exists:** ticket-service's `Ticket.assignedTo` field (Phase 3) was never verified against real org membership — a ticket could be assigned to an arbitrary UUID with no check it's even a user, let alone a member of that org. Not blocking for this phase, but worth a quick retrofit using the same new endpoint once it exists, for consistency. Note it in `docs/project-progress.md` if not fixed now.
- Versioning: edits after review starts create a new `PRVersion`, not an in-place update. Diff endpoint using the `diff` npm package.
- Cross-org PR sharing, same pattern and same connection-check requirement as ticket sharing — reuse the shared connection-check function from Phase 3 rather than rewriting it.
- Same `orgScope`/share-check discipline as ticket-service — same 5-step check, same function shape (consider whether this logic can literally live in `packages/shared` and be reused by both services rather than duplicated in each).
- **Same PSA rule as Phase 3: `requireRole(...)` calls here must pass `{ allowPlatformAdmin: false }` too.** PSA has no PR visibility anywhere, same as tickets — this was already resolved in Phase 3, reuse that decision rather than re-deriving it.
- `auditClient.log(...)` on every mutation — same caveat as Phase 3 if audit-service isn't live yet.
- `pr-service`'s `seed.ts` per the master spec (2 PRs, 1 reviewer, 1 version, 1 changes-requested review, 1 cross-org share).

**Non-goals:** no frontend yet.

**Definition of done:** same BOLA/isolation guarantees as Phase 3, applied to PRs. Approval count correctly auto-transitions status; a changes-requested review correctly blocks approval regardless of count. Diff endpoint returns a correct added/removed structure between two versions.

---

## Phase 5 — Audit Service: Logging, Unified Viewer, Notifications, AI Digest

**Goal:** the append-only audit trail is real (DB-enforced), the unified viewer works across both dashboards' data, and the AI digest job runs on a schedule without ever seeing unscoped data.

**Scope (see `api_reference.md` → audit-service):**
- `POST /internal/audit-events` — the write path ticket-service and pr-service were already calling (or stubbing) since Phase 3/4, and identity-service's connection-lifecycle calls added in Phase 2. **Go back and confirm all three services' calls now actually work end-to-end** — this is exactly the kind of gap earlier phases were told to flag, not hide. **Also convert every service's `logAudit()` from the Phase 2–4 swallow-and-warn stopgap to the final resolved design (see `CLAUDE.md` rule #9): call audit-service first, using the pre-generated resource ID, and only perform the actual database mutation if that call succeeds.** This is a real refactor across all three services' mutation paths, not just pointing the stub at a real URL — the call order flips (audit before mutate, not after), and a failing audit call must now abort the operation with an error rather than being logged-and-ignored.
- Append-only enforcement: run the `audit_writer` role SQL (INSERT+SELECT only, UPDATE/DELETE revoked) against the audit schema. audit-service's runtime `.env` connects as `audit_writer`; a separate `.env` var for migrations uses the superuser/owner connection.
- `GET /audit-log` with all filters (`userId, from, to, action, format=csv`) — `orgId` always forced server-side to caller's own org, never trusted from a query param.
- Notifications: `Notification` model (add to audit schema's `schema.prisma` now if not already present from Phase 1), `GET /notifications`, `PATCH /notifications/:id/read`.
- AI digest background job: `node-cron` scheduler, configurable interval via env var. Per user: internal calls to ticket-service and pr-service for pre-aggregated facts (assigned/overdue ticket counts, PRs awaiting review + oldest idle time) → build a short structured prompt from ONLY those facts → send to Groq (Llama 3.3 70B, OpenAI-compatible client, model `llama-3.3-70b-versatile` or current equivalent — verify exact model string against Groq's docs at build time) → store the digest text, create a `Notification` row.
- **Critical constraint on the AI prompt:** construct it from pre-scoped aggregate facts only (numbers, ticket/PR titles the user already has legitimate access to) — never pass a raw DB query result or any other user/org's data into the prompt, even filtered client-side after the fact. The scoping has to happen before the LLM call, not be relied upon in the LLM's instructions.

**Non-goals:** no frontend yet (notification bell UI comes in Phase 8). No email/push delivery (future scope, in-app only).

**Definition of done:** ticket/PR mutations from Phase 3/4 now produce real rows in `AuditLog`. Directly connecting as `audit_writer` and attempting UPDATE/DELETE against `AuditLog` fails with a permission error. `GET /audit-log` correctly filters and CSV-exports, scoped to caller's org regardless of query params. The digest job runs on schedule and produces a notification whose content is demonstrably built only from the requesting user's own scoped data.

---

## Phase 6 — Security Hardening & Automated Tests

**Goal:** close every gap the earlier phases were allowed to defer, and prove the core guarantees with real automated tests — this phase is what the assignment is actually graded on more than any other.

**Scope:**
- Sweep all 4 services: helmet on every app, CORS allowlist set to the two real frontend origins (not `*`) everywhere, zod validation on every route body that doesn't have it yet.
- Confirm refresh-token rotation + reuse detection is airtight (retest from Phase 2 now that ticket/pr/audit services exist and could be a source of confused session state).
- Confirm every ticket/pr/audit route that touches an `orgId` uses the shared `orgScope`/share-check helper — grep for any raw `where: { id: ... }` query missing an org filter and fix it now.
- Write and pass all 5 test suites (Jest + Supertest), per `CLAUDE.md`/master spec:
  - `tenant-isolation.test.js` — manipulated foreign-org ID → 404, for both tickets and PRs.
  - `sharing.test.js` — share grants exactly the one resource, view+comment only; revoking the connection removes access even with the share row intact.
  - `ai-leakage.test.js` — mock the Groq call, assert the outbound prompt string contains only the requesting user's own scoped data, nothing else.
  - `auth.test.js` — login → refresh → org-switch → logout-everywhere → reused refresh token rejected and revokes session.
  - `audit-permissions.test.js` — `audit_writer` role rejects UPDATE/DELETE at the DB level (codifying what was manually verified in Phase 5).

**Non-goals:** no new features. This phase only hardens and tests what already exists — if a test reveals a real bug, fix the bug, but don't scope-creep into new functionality.

**Definition of done:** all 5 test suites pass. Manual spot-check: log in as each of the 5 roles and confirm the role matrix in `CLAUDE.md`/master spec holds in the running app, not just in tests.

---

## Phase 7 — Frontend: Shared Component Library + Support Hub

**Goal:** Dashboard 1 (Support Hub) is fully usable against the real, now-hardened backend.

**Scope:**
- Read `reference/frontend_reference.md` in full before writing any component — it's authoritative for design tokens, layout conventions, and component styling. Where it's silent on something, use judgment consistent with its existing patterns rather than introducing a new style.
- `frontend/packages/ui`: auth-aware layout shell (nav + org switcher dropdown + logout button), ticket/PR card, status badge, role-gated action button wrapper, comment thread component, notification bell, audit-log filter bar + table (used by both apps, built once here even though Review Console needs it too in Phase 8).
- Real auth wiring: access token in memory only (React context), silent refresh on load via the shared cookie, login/register forms hitting the real `/auth/*` endpoints.
- Support Hub screens: ticket list (status filter), ticket detail (comments, attachments, status controls gated by role), org connections management UI, feature-flag display (read-only).
- Org switcher wired to `/auth/switch-org`, refetching current view on switch.
- Tailwind, mobile-responsive breakpoints (usable at phone width, not necessarily optimized).

**Non-goals:** no Review Console screens yet (Phase 8), even though the shared component library built here is reused there.

**Definition of done:** a user can register, log in, see their org's tickets, create/comment/attach, switch org context, and log out (which also invalidates the session for Review Console, even though its UI isn't built yet — testable by checking the API directly).

---

## Phase 8 — Frontend: Review Console

**Goal:** Dashboard 2 is fully usable, reusing the Phase 7 component library.

**Scope:**
- Continue following `reference/frontend_reference.md` — reuse Phase 7's established patterns (spacing, color, component variants) rather than drifting to a new style for the second app.
- **Use the new `GET /orgs/:id/members` endpoint (added after Phase 7) for the reviewer-assignment picker** — a real dropdown of the org's `REVIEWER`-role members, not a free-text UUID field. Also retrofit Support Hub's `assignedTo` field to use it while you're touching related code, since it was flagged as the same gap in Phase 7.
- PR list, PR detail (reviewers, approval status/actions, version/diff view rendered from the pre-computed diff object).
- Unified audit viewer screen: filter bar + table + CSV export button, using the shared component from Phase 7.
- Notification bell wired to `GET /notifications` / `PATCH /notifications/:id/read`.
- Cross-org sharing UI for both tickets (in Support Hub, if not already added in Phase 7) and PRs.

**Non-goals:** none beyond what's already deferred (feature-flag admin UI, GitHub integration, etc. — see `docs/known-limitations.md`).

**Definition of done:** a user can see PRs, review/approve/request-changes, view a version diff, browse and export the unified audit log, and see notifications from the AI digest job. Full role matrix holds across both dashboards now.

---

## Phase 9 — Seed Data Finalization, Deployment, Documentation, Demo Prep

**Goal:** submission-ready.

**Scope:**
- Re-run/verify seed scripts produce the exact required demo scenario (2 orgs, 1 approved connection, sample tickets/PRs) on a clean database, with credentials printed clearly.
- **Custom domain required before deployment, not optional:** session sync depends on both dashboards sharing one parent domain for the refresh cookie. Default `*.vercel.app` / `*.up.railway.app` subdomains belong to different root domains and cannot share a cookie — you need a real domain you control DNS for (e.g. `support.yourapp.com` and `review.yourapp.com`, or path-based routing under one host). Secure this domain before starting this phase, not during it, since acquiring/propagating DNS can take longer than the rest of the deploy.
- Deploy: Railway for the 4 backend services + Postgres + Redis; Vercel (or Railway) for both Next.js apps, deployed independently. Update CORS allowlist and cookie domain from `localhost` to the real parent domain.
- Run `prisma migrate deploy` + seed against the production database once.
- `/docs`: architecture diagram, `erd.mermaid`, `setup-guide.md`, `known-limitations.md` (consolidate every deferred item from every phase above into one place), root `README.md`, and the agentic-tooling note.
- Record the ~2 minute demo video per the beat sheet in the master spec.
- Final pass through the assignment checklist (master spec §30) before submitting.
- Add a closing entry to `docs/project-progress.md` summarizing the project as a whole (not just Phase 9) — this becomes part of what a reviewer or future-you reads first.

**Definition of done:** hosted public URL works for both dashboards with printed test credentials for ≥2 orgs; GitHub repo is clean (no committed `.env`, no `node_modules`); `/docs` is complete; demo video recorded; checklist fully reviewed.