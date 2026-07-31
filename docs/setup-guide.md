# Local Setup Guide

How to get all 6 apps (4 backend services + 2 Next.js frontends) running on your own machine.

## Prerequisites

- Node.js (workspaces-compatible npm — repo uses npm workspaces, see root `package.json`)
- PostgreSQL, running locally on `localhost:5432`, with a single database named `froncort` (one Postgres instance, one DB, one schema per service — `identity`, `tickets`, `prs`, `audit`)
- Docker Desktop (for Redis via `docker-compose.yml` — Postgres is **not** in that compose file, it's assumed already running locally)
- OpenSSL on PATH (only needed once, for `scripts/generate-jwt-keys.sh`)

## 1. Install dependencies

```bash
npm install
```

Installs every workspace (`packages/*`, `frontend/packages/*`, `frontend/apps/*`) from the repo root.

## 2. Create your `.env`

```bash
cp .env.example .env
```

Fill in / adjust:
- `IDENTITY_DATABASE_URL`, `TICKETS_DATABASE_URL`, `PRS_DATABASE_URL`, `AUDIT_DATABASE_URL` — point these at your local Postgres (`froncort` database, one schema each). Percent-encode any special characters in the password (e.g. `@` → `%40`).
- `AUDIT_RUNTIME_DATABASE_URL` — leave as-is for now; the `audit_writer` role it points to is created in step 4.
- `INTERNAL_API_KEY` — any shared secret string, used for service-to-service calls.
- `GROQ_API_KEY` — only required if you want the AI digest feature to actually call Groq; the rest of the app runs fine without it.
- Leave `COOKIE_DOMAIN` blank and `COOKIE_SAME_SITE=lax` for local dev — both are production-only overrides (see `docs/known-limitations.md`).

## 3. Generate JWT signing keys

```bash
./scripts/generate-jwt-keys.sh
```

Generates an RS256 keypair and appends base64-encoded `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` lines directly into `.env`. Nothing is printed to the terminal or leaves your machine. Re-run any time to rotate the keys (old lines are replaced, not duplicated).

## 4. Start Redis

```bash
docker compose up -d redis
```

Starts `froncort-redis` on `localhost:6379`. Requires Docker Desktop's daemon to be running first.

## 5. Set up the database

Run migrations for all 4 services:

```bash
npm run prisma:migrate
```

Then lock down the audit log at the database level (append-only enforcement — see `packages/audit-service/prisma/append-only.sql`):

```bash
psql "postgresql://postgres:postgres@localhost:5432/froncort" -f packages/audit-service/prisma/append-only.sql
```

This creates the restricted `audit_writer` Postgres role (`INSERT`+`SELECT` only on `AuditLog`, no `UPDATE`/`DELETE` — enforced at the DB level, not just in application code) with the default local password `change-me-in-production`. That matches `AUDIT_RUNTIME_DATABASE_URL` in `.env.example` — if you change the role's password, update that env var to match.

Seed demo data (run once per service):

```bash
npm run --workspace packages/identity-service exec -- prisma db seed
npm run --workspace packages/ticket-service exec -- prisma db seed
npm run --workspace packages/pr-service exec -- prisma db seed
```

All three are idempotent (upsert-based, fixed IDs) — safe to re-run against an existing DB.

## 6. Run everything

From the repo root:

```bash
npm run dev
```

This fans out to all 6 apps concurrently (`concurrently`, color-coded per app): identity-service, ticket-service, pr-service, audit-service, support-hub, review-console. Or run any subset individually with `npm run dev -w <workspace>`.

| Service | Port | URL |
|---|---|---|
| identity-service | 4001 | http://localhost:4001 |
| ticket-service | 4002 | http://localhost:4002 |
| pr-service | 4003 | http://localhost:4003 |
| audit-service | 4004 | http://localhost:4004 |
| support-hub (frontend) | 3000 | http://localhost:3000 |
| review-console (frontend) | 3001 | http://localhost:3001 |

Open http://localhost:3000 (Support Hub) or http://localhost:3001 (Review Console) and log in with any of the seeded accounts below.

## 7. Run tests (optional)

```bash
npm run test:setup   # provisions/reseeds the disposable froncort_test database
npm test             # jest --runInBand
```

---

## Seeded demo data

Every seeded user shares the same password:

```
Password123!
```

### Users

| Email | Name | Org | Role |
|---|---|---|---|
| `admin@alpha.test` | Alice Admin | Alpha Support Co. | `ORG_ADMIN` |
| `agent@alpha.test` | Aaron Agent | Alpha Support Co. | `SUPPORT_AGENT` |
| `reviewer@alpha.test` | Ada Reviewer | Alpha Support Co. | `REVIEWER` |
| `admin@beta.test` | Bianca Admin | Beta Review Partners | `ORG_ADMIN` |
| `agent@beta.test` | Ben Agent | Beta Review Partners | `SUPPORT_AGENT` |
| `reviewer@beta.test` | Bea Reviewer | Beta Review Partners | `REVIEWER` |
| `super@froncort.ai` | Platform Super Admin | — (no org membership) | Platform Super Admin (`isPlatformAdmin: true`) |

The Platform Super Admin is seed-only — there is no promotion endpoint that grants this role at runtime (locked decision, see `docs/project-progress.md` Phase 2).

### Organizations

| Org | ID |
|---|---|
| Alpha Support Co. | `00000000-0000-0000-0000-0000000a1fa0` |
| Beta Review Partners | `00000000-0000-0000-0000-0000000be7a0` |

### Seeded cross-org connection

| Connection | ID | Status |
|---|---|---|
| Alpha → Beta | `00000000-0000-0000-0000-00000000c001` | `APPROVED` |

Alpha and Beta start out already connected (sharing tickets/PRs between them will work immediately). To test the connection request/approve flow from scratch, revoke this seeded connection first or use a third, unseeded org.

### Seeded tickets / PRs

- pr-service seeds 2 pull requests: `pr1` (Alpha, `IN_REVIEW`, `requiredApprovals: 2`, shared with Beta) and `pr2` (Beta, `DRAFT`), plus one reviewer assignment, one baseline version, and one `CHANGES_REQUESTED` review.
- ticket-service seeds demo tickets under Alpha/Beta per the same fixed-ID pattern (see `packages/ticket-service/prisma/seed.js`).

All seed IDs are defined once, centrally, in `packages/shared/seedIds.js` — every service's seed script imports from there so cross-service references (e.g. a seeded PR referencing a seeded user) stay consistent without a runtime cross-schema dependency.
