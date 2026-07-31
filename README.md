<div align="center">

# Unified Org Workspace

**A multi-tenant SaaS platform combining a support-ticketing dashboard and a code-review dashboard under one shared identity layer.**

[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)](#tech-stack)
[![Next.js](https://img.shields.io/badge/Next.js-React-000000?logo=next.js&logoColor=white)](#tech-stack)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?logo=postgresql&logoColor=white)](#tech-stack)
[![Redis](https://img.shields.io/badge/Redis-cache%2Fsessions-DC382D?logo=redis&logoColor=white)](#tech-stack)

🚀 **[Live Demo](#)** &nbsp;·&nbsp; 🎥 **[Video Walkthrough](#)**

</div>

---

## Overview

Most multi-tenant platforms treat tenant isolation as an implementation detail, a `WHERE` clause that's easy to get right in code review and easy to get wrong under deadline pressure. A single missing org-scope check on one query is all it takes to leak one customer's data into another's view. This project treats that boundary as the actual product, not an afterthought: every tenant-data query is scoped by the organization ID from a cryptographically verified token — never a value trusted from a URL or request body and the audit trail is append-only at the database *permission* level, so even a compromised application server can't silently rewrite history.

The system combines:

- A **Node.js/Express** backend split into four independently deployable microservices, backed by **PostgreSQL** (via Prisma) with one isolated schema per service
- **JWT (RS256) authentication** with Redis-backed, rotating refresh tokens and reuse detection, shared transparently across two frontends under one session
- **Five-role RBAC** (Org Admin, Support Agent, Reviewer/Approver, a share-based Cross-Org Guest, and a platform-wide Admin) enforced at both the route and query layer
- An **AI-generated activity digest** (Groq) built entirely from pre-aggregated, pre-scoped facts so cross-tenant leakage is structurally prevented, not just policy-forbidden

---

## Features

- 🎫 **Support Hub** — ticket CRUD, threaded comments, file attachments, status/priority workflows, per-tenant feature flags
- 🔍 **Review Console** — pull-request-style workflow with multi-reviewer approval, a configurable N-approvals threshold, content versioning with a rendered diff view, and a reviewer-request-changes override
- 🤝 **Cross-org collaboration** — organizations connect via an explicit request/approve/revoke handshake, then share individual tickets or PRs (never full workspace access) with view-and-comment-only guest access
- 📋 **Unified audit trail** — a single, filterable (by org, user, date range, action), CSV-exportable activity log spanning both dashboards
- 🔔 **Scheduled AI digests** — a background job summarizes each user's outstanding work on a recurring interval, not computed on page load
- 🔐 **Full session lifecycle** — org switching without re-login, and a single logout that invalidates the session across both dashboards simultaneously
- ✅ **Automated security test suite** — dedicated tests proving tenant isolation under a manipulated resource ID, correct cross-org share behavior, AI prompt data-leakage prevention, and database-enforced audit immutability

---

## Architecture

Four independently deployable microservices: identity, ticketing, code review, and audit, share one PostgreSQL instance (one schema per service, **no cross-schema foreign keys**: trust flows through verified tokens, not shared database access) and one Redis instance for sessions and rate limiting. Two Next.js frontends share a single login and session across one parent domain.

![Architecture Diagram](./docs/architecture-diagram.svg)

---

## Tech Stack

| Layer | Choice |
|---|---|
| **Frontend** | Next.js + React + Tailwind CSS, shared component library across both apps |
| **Backend** | Node.js + Express — 4 independently deployable microservices |
| **Database** | PostgreSQL via Prisma — one instance, one schema per service |
| **Cache / Sessions** | Redis — refresh tokens, rate limiting |
| **AI** | Groq API (`openai/gpt-oss-120b`) for scheduled activity-digest generation |
| **Auth** | JWT (RS256) + Redis-backed rotating refresh tokens |
| **Tests** | Jest + Supertest — tenant isolation, cross-org sharing, AI data-leakage, auth lifecycle, audit permission enforcement |
| **Deployment** | Railway — all backend services, Postgres, Redis, and both frontend apps |

---

## API Reference

Internal service-to-service endpoints (`/internal/*`, key-authenticated) are omitted below for brevity.

**Identity Service** — auth, organizations, cross-org connections

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create an account + a new organization |
| POST | `/auth/login` | Authenticate, receive an access token + session cookie |
| POST | `/auth/refresh` | Rotate the refresh token, issue a new access token |
| POST | `/auth/switch-org` | Switch active organization context without re-authenticating |
| DELETE | `/auth/session` | Log out — invalidates the session across both dashboards |
| GET | `/auth/me` | Current user + org memberships |
| GET | `/orgs/:id` | Organization details |
| GET | `/orgs/:id/members` | List an org's members |
| POST/PATCH/DELETE | `/orgs/:id/members[/:userId]` | Add, change role, or remove a member |
| POST | `/orgs/:id/connections` | Request a cross-org connection |
| PATCH | `/connections/:id` | Approve or revoke a connection |
| GET | `/orgs/:id/connections` | List an org's connections |

**Ticket Service** — Support Hub

| Method | Path | Description |
|---|---|---|
| POST/GET | `/tickets` | Create or list tickets |
| GET/PATCH/DELETE | `/tickets/:id` | View, update, or delete a ticket |
| POST/GET | `/tickets/:id/comments` | Add or list comments |
| POST/GET | `/tickets/:id/attachments` | Upload or list attachments |
| GET | `/orgs/:orgId/feature-flags` | Read an org's feature flags |
| POST/GET/DELETE | `/tickets/:id/shares[/:shareId]` | Share, list, or revoke cross-org ticket access |

**PR Service** — Review Console

| Method | Path | Description |
|---|---|---|
| POST/GET | `/prs` | Create or list pull requests |
| GET/PATCH/DELETE | `/prs/:id` | View, update, or delete a PR |
| POST | `/prs/:id/reviewers` | Assign a reviewer |
| POST | `/prs/:id/reviews` | Approve or request changes |
| GET | `/prs/:id/versions` | List content versions |
| GET | `/prs/:id/versions/:n/diff` | Diff a version against its predecessor |
| POST/GET/DELETE | `/prs/:id/shares[/:shareId]` | Share, list, or revoke cross-org PR access |

**Audit Service** — unified log, notifications

| Method | Path | Description |
|---|---|---|
| GET | `/audit-log` | Filterable, CSV-exportable activity log across both dashboards |
| GET | `/notifications` | Current user's notifications |
| PATCH | `/notifications/:id/read` | Mark a notification read |

---

## File Structure

```
├── packages/
│   ├── shared/              # JWT, org-scoping, audit client, shared middleware
│   ├── identity-service/    # auth, organizations, memberships, connections
│   ├── ticket-service/      # Support Hub
│   ├── pr-service/          # Review Console
│   └── audit-service/       # unified log, notifications, AI digest scheduler
├── frontend/
│   ├── packages/ui/         # shared component library
│   ├── apps/support-hub/    # Next.js — ticketing dashboard
│   └── apps/review-console/ # Next.js — code review dashboard
├── docs/                    # architecture diagram, setup guide, known limitations
├── scripts/                 # JWT keypair generation, DB setup
├── tests/                   # cross-service automated test suites
└── docker-compose.yml       # local Redis
```

---

## Getting Started Locally

```bash
npm install
docker compose up -d          # Redis only — Postgres runs locally, not containerized
npm run prisma:migrate        # applies all 4 services' schemas
npx prisma db seed            # run per service directory
npm run dev                   # starts all 4 backend services + both frontend apps
npm test                       # full automated test suite (isolated test database)
```

Full setup instructions: [`docs/setup-guide.md`](./docs/setup-guide.md).

---

## Test Credentials

Seed data includes 2 sample organizations with an approved connection between them, and one user per role:

| Email | Role | Org |
|---|---|---|
| `admin@alpha.test` | Org Admin | Alpha |
| `agent@alpha.test` | Support Agent | Alpha |
| `reviewer@alpha.test` | Reviewer/Approver | Alpha |
| `admin@beta.test` | Org Admin | Beta |
| `reviewer@beta.test` | Reviewer/Approver | Beta |
| `super@example.com` | Platform Admin | — |

All seeded accounts share the password **`Password123!`**.
