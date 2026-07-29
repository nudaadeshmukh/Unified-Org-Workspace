# API Reference — Froncort Unified Org Workspace

*Lives at `reference/api_reference.md`. Referenced from `CLAUDE.md` and `reference/implementation_guide.md` — this is the canonical contract; don't let route implementations drift from what's written here.*

Exact contract for every endpoint. Match method, path, roles, and response shape precisely — do not improvise variations. Response envelope for all endpoints: success → `{ data: ... }`, failure → `{ error: { message, code } }`.

Role shorthand: **OA** = Org Admin, **SA** = Support Agent, **REV** = Reviewer/Approver, **GUEST** = valid share-holder (not a stored role — see CLAUDE.md), **PSA** = Platform Super Admin, **ANY** = any authenticated user regardless of role, **PUBLIC** = no auth required.

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
| POST | `/orgs/:id/connections` | OA (own org) | Body: `{targetOrgId}`. Creates status=PENDING. |
| PATCH | `/connections/:id` | OA of the **target** org (approve) or OA of **either** org (revoke) | Body: `{status: 'APPROVED' \| 'REVOKED'}`. Revoke only valid from APPROVED. Re-approval after revoke requires a brand-new PENDING request. |
| GET | `/orgs/:id/connections` | OA (own org) or PSA | Lists all connections for an org, any status. |

### Internal (service-to-service only, requires internal API key header)
| Method | Path | Notes |
|---|---|---|
| GET | `/internal/connections/status?orgA=&orgB=` | Used by ticket-service/pr-service before creating a share, to confirm an APPROVED connection exists between two orgs. |

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

---

## pr-service (Phase 4)

### Pull Requests
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/prs` | OA, SA-equivalent authors (own org) | Body: `{title, description, requiredApprovals}`. Status starts `DRAFT`. |
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
No public endpoint. Triggered by a `node-cron` schedule inside audit-service. Internally calls ticket-service and pr-service (via internal API key) for pre-scoped facts per user, sends a short structured prompt to Groq (Llama 3.3 70B), stores the result, creates a `Notification` row. See `implementation_guide.md` Phase 5 for the exact prompt-construction rule (facts only, never raw queries, never other-org data).

---

## Cross-cutting: internal API key header

All `/internal/*` routes across all 4 services require header:
```
X-Internal-Api-Key: <INTERNAL_API_KEY from .env>
```
Requests without a valid key get 401, no exceptions, even in development.
