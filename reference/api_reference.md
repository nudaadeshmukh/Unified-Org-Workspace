# API Reference — Froncort Unified Org Workspace

*Lives at `reference/api_reference.md`. Referenced from `CLAUDE.md` and `reference/implementation_guide.md` — this is the canonical contract; don't let route implementations drift from what's written here.*

Exact contract for every endpoint. Match method, path, roles, and response shape precisely — do not improvise variations. Response envelope for all endpoints: success → `{ data: ... }`, failure → `{ error: { message, code } }`.

Role shorthand: **OA** = Org Admin, **SA** = Support Agent, **REV** = Reviewer/Approver, **GUEST** = valid share-holder (not a stored role — see CLAUDE.md), **PSA** = Platform Super Admin, **ANY** = any authenticated user regardless of role, **PUBLIC** = no auth required.

**PSA note:** PSA only appears in role columns for identity-service's own org/connection-management routes. Nowhere in ticket-service or pr-service's tables below does PSA appear — that's intentional, not an omission. PSA has no ticket/PR visibility anywhere, in any org. `requireRole()` calls in those two services must pass `{ allowPlatformAdmin: false }` explicitly; see `CLAUDE.md` → Platform Super Admin scope.

---

## identity-service (Phase 2)

### Auth
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/auth/register` | PUBLIC | Body: `{email, password, name, orgName}`. Creates User + Organization + OrgMembership(role=ORG_ADMIN). Sets refresh cookie. |
| POST | `/auth/login` | PUBLIC | Body: `{email, password}`. Sets refresh cookie, returns access token + `{user, memberships}`. |
| POST | `/auth/refresh` | PUBLIC (requires valid refresh cookie) | Rotates refresh token. Returns new access token. Reuse of an already-rotated token revokes the whole session. |
| POST | `/auth/switch-org` | ANY | Body: `{orgId}`. Verifies membership, issues new access token with updated `active_org_id`/`org_role`. |
| DELETE | `/auth/session` | ANY | Deletes refresh token from Redis, clears cookie. This is "logout everywhere" for both dashboards. |
| GET | `/auth/me` | ANY | Returns current user + all memberships (for org-switcher UI). |

### Organizations & Membership
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/orgs/:id` | ANY (own org) or PSA | Org details. |
| POST | `/orgs/:id/members` | OA (own org) or PSA | Body: `{email, role}`. Adds/invites a member. |
| PATCH | `/orgs/:id/members/:userId` | OA (own org) or PSA | Body: `{role}`. Changes a member's role. |
| DELETE | `/orgs/:id/members/:userId` | OA (own org) or PSA | Removes a member. |

### Cross-Org Connections
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/orgs/:id/connections` | OA (own org) or PSA | Body: `{targetOrgId}`. Creates status=PENDING. |
| PATCH | `/connections/:id` | OA of the **target** org (approve) or OA of **either** org (revoke), or PSA for either action | Body: `{status: 'APPROVED' \| 'REVOKED'}`. Revoke only valid from APPROVED. Re-approval after revoke requires a brand-new PENDING request. |
| GET | `/orgs/:id/connections` | OA (own org) or PSA | Lists all connections for an org, any status. |

### Internal (service-to-service only, requires internal API key header)
| Method | Path | Notes |
|---|---|---|
| GET | `/internal/connections/status?orgA=&orgB=` | Used by ticket-service/pr-service before creating a share, to confirm an APPROVED connection exists between two orgs. |
| GET | `/internal/users/:userId/org-role?orgId=` | **Added in Phase 4.** Returns `{ data: { role: 'ORG_ADMIN' \| 'SUPPORT_AGENT' \| 'REVIEWER' \| null, isPlatformAdmin: boolean } }` — `role: null` means the user is not a member of that org at all (this is a 200 with `role: null`, not a 404 — the caller decides what "not a member" means for its use case). Built so pr-service can verify a `userId` is actually a `REVIEWER` in the target org before creating a `PRReviewer` row — never trust a role claim from the request body. Add a corresponding `packages/shared/identityClient.js` function (`getUserOrgRole(userId, orgId)`) alongside the existing `checkConnectionApproved`, with the same fail-closed behavior: if identity-service is unreachable, treat it as "cannot verify" (reject the action), never as "verified." |
| GET | `/internal/org-members?orgId=` | **Added in Phase 5.** Returns `{ data: [{ userId, orgId, role }] }` — every `OrgMembership` row for `orgId`, or every membership across every org if `orgId` is omitted. Built so audit-service's AI digest job can enumerate which (user, org) pairs to generate a digest for. Each row is treated as one independent unit of digest generation — a user in 2 orgs gets 2 separate digest computations and 2 separate `Notification` rows, never a combined cross-org digest in one prompt. Add a corresponding `packages/shared/identityClient.js` function (`getOrgMembers(orgId?)`), same fail-closed contract as the other internal-client functions: returns `null` (not an empty array) on any failure, so "identity-service is down" is distinguishable from "there really are zero members." |

---

## ticket-service (Phase 3)

### Tickets
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/tickets` | OA, SA (own org) | Body: `{title, description, priority, assignedTo?}`. |
| GET | `/tickets` | OA, SA, REV (own org, + anything shared with caller's org) | Query params for filtering by status. |
| GET | `/tickets/:id` | OA, SA, REV (own org) OR GUEST (valid share only) | **This is the BOLA-critical endpoint.** Must return 404 (not the resource) if the ticket isn't in the caller's org and no valid non-revoked share + APPROVED connection exists. |
| PATCH | `/tickets/:id` | OA, SA (own org only — never via a share) | Status/assignment/priority updates. |
| DELETE | `/tickets/:id` | OA (own org only) | |

### Comments & Attachments
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/tickets/:id/comments` | OA, SA, REV (own org) OR GUEST (valid share) | Guest can comment — view+comment is the guest's full permission set. |
| GET | `/tickets/:id/comments` | Same access rule as `GET /tickets/:id` | |
| POST | `/tickets/:id/attachments` | OA, SA (own org only) | Guests cannot upload. |
| GET | `/tickets/:id/attachments` | Same access rule as `GET /tickets/:id` | |

### Feature Flags
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/orgs/:orgId/feature-flags` | ANY (own org) | Read-only for this build; flags set via seed data. |

### Cross-Org Ticket Sharing
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/tickets/:id/shares` | OA (of the ticket's own org) | Body: `{partnerOrgId}`. Must call identity-service's internal connection-status check first — reject if not APPROVED. |
| GET | `/tickets/:id/shares` | OA (of the ticket's own org) | |
| DELETE | `/tickets/:id/shares/:shareId` | OA (of the ticket's own org) | Sets `revokedAt`, does not hard-delete. |

### Internal (service-to-service only, requires internal API key header)
| Method | Path | Notes |
|---|---|---|
| GET | `/internal/facts/tickets?userId=&orgId=` | **Added in Phase 5.** Returns `{ data: { assignedCount, overdueCount } }` — pre-aggregated, already-scoped-to-this-user-and-org facts for audit-service's AI digest job. `assignedCount`/`overdueCount` both only count tickets still `OPEN`/`IN_PROGRESS` (not lifetime totals). `overdueCount` is a heuristic (Ticket has no due-date field in this schema): still-open tickets created more than `TICKET_OVERDUE_THRESHOLD_DAYS` days ago (default 3), not a literal due-date comparison. |

---

## pr-service (Phase 4)

### Pull Requests
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/prs` | OA (own org) | Body: `{title, description, requiredApprovals}`. Status starts `DRAFT`. **Author-only, not Reviewer** — per the assignment's own role definitions, Org Admin has full control including authoring; Reviewer's scope is specifically reviewing/approving, not creating PRs. Support Agent has zero access to pr-service anywhere, including this endpoint — Support Agent is Dashboard 1 only. |
| GET | `/prs` | OA, REV (own org, + anything shared with caller's org) | |
| GET | `/prs/:id` | OA, REV (own org) OR GUEST (valid share) | Same BOLA discipline as ticket detail. |
| PATCH | `/prs/:id` | Author or OA (own org only) | If status is DRAFT: update in place. If IN_REVIEW or later: creates a new PRVersion instead of overwriting. |
| DELETE | `/prs/:id` | OA (own org only) | |

### Reviewers & Approval Workflow
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/prs/:id/reviewers` | OA or author (own org) | Body: `{userId}`. Must be a REV in that org. |
| POST | `/prs/:id/reviews` | REV assigned to this PR, or OA | Body: `{status: 'APPROVED' \| 'CHANGES_REQUESTED', comment?}`. Triggers auto-transition logic (§ below). |

**Auto-transition logic:** on each new approval, count distinct APPROVED reviewers ≥ `requiredApprovals` → set PR status to `APPROVED`. Any `CHANGES_REQUESTED` sets status back to `IN_REVIEW` regardless of approval count.

### Versioning & Diff
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/prs/:id/versions` | Same access as `GET /prs/:id` | |
| GET | `/prs/:id/versions/:n/diff` | Same access as `GET /prs/:id` | Returns `{added: [...], removed: [...]}` diffing version n's content against n-1. |

### Cross-Org PR Sharing
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/prs/:id/shares` | OA (of the PR's own org) | Same connection-check requirement as ticket sharing. |
| GET | `/prs/:id/shares` | OA (of the PR's own org) | |
| DELETE | `/prs/:id/shares/:shareId` | OA (of the PR's own org) | Soft-revoke, same as tickets. |

### Internal (service-to-service only, requires internal API key header)
| Method | Path | Notes |
|---|---|---|
| GET | `/internal/facts/prs?userId=&orgId=` | **Added in Phase 5.** Returns `{ data: { awaitingReviewCount, oldestIdleHours } }` — pre-aggregated, already-scoped-to-this-user-and-org facts for audit-service's AI digest job. "Awaiting this user's review" = PR is `IN_REVIEW`, this user is an assigned `PRReviewer`, and this user hasn't yet submitted any review on it. `oldestIdleHours` is `null` (not `0`) when `awaitingReviewCount` is 0 — a real "nothing outstanding" result, not a missing value. |

---

## audit-service (Phase 5)

### Internal (write path — requires internal API key, called only by other services)
| Method | Path | Notes |
|---|---|---|
| POST | `/internal/audit-events` | Body: `{orgId, actorId, action, entityType, entityId, metadata}`. Runtime DB connection uses the restricted `audit_writer` role. |

**Actions that MUST call this** (non-exhaustive minimum — check before assuming a new mutation doesn't need one): `TICKET_CREATED`, `TICKET_UPDATED`, `TICKET_DELETED`, `TICKET_SHARED`, `TICKET_SHARE_REVOKED`, `COMMENT_ADDED`, `ATTACHMENT_ADDED`, `PR_CREATED`, `PR_STATUS_CHANGED`, `PR_APPROVED`, `PR_CHANGES_REQUESTED`, `PR_MERGED`, `PR_SHARED`, `PR_SHARE_REVOKED`, `CONNECTION_REQUESTED`, `CONNECTION_APPROVED`, `CONNECTION_REVOKED`.

### Unified Audit Viewer (read path)
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/audit-log` | OA, REV (own org only) | Query params: `userId, from, to, action, format=csv`. `orgId` is ALWAYS forced to the caller's own org server-side, regardless of any org-related query param — this is a read endpoint but still subject to the same isolation discipline. `format=csv` reuses the identical scoped query, serialized differently. |

### Notifications
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/notifications` | ANY (own only) | Unread-first ordering. |
| PATCH | `/notifications/:id/read` | ANY (own only) | |

### AI Digest
No public endpoint. Triggered by a `node-cron` schedule inside audit-service (interval from `AI_DIGEST_INTERVAL_HOURS`). Enumerates `(userId, orgId)` pairs via identity-service's `GET /internal/org-members`; for each one, internally calls ticket-service's `GET /internal/facts/tickets` and pr-service's `GET /internal/facts/prs` for pre-scoped facts, sends a short structured prompt built from ONLY those facts to Groq (model from `GROQ_MODEL` — **updated at Phase 5 build time from `llama-3.3-70b-versatile` to `openai/gpt-oss-120b`, since Groq deprecated the former on 2026-06-17 and recommends the latter as the direct migration target**), stores the result, creates a `Notification` row. A user in 2 orgs gets 2 independent digest computations and 2 separate `Notification` rows — never one combined cross-org digest in a single prompt. See `implementation_guide.md` Phase 5 for the exact prompt-construction rule (facts only, never raw queries, never other-org data).

---

## Cross-cutting: internal API key header

All `/internal/*` routes across all 4 services require header:
```
X-Internal-Api-Key: <INTERNAL_API_KEY from .env>
```
Requests without a valid key get 401, no exceptions, even in development.