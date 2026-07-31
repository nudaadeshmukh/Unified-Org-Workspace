# Future Improvements

Things that are deliberately unfinished, deferred, or scoped out of this build — kept separate from `docs/known-limitations.md`, which covers *accepted trade-offs already shipped as-is*. This file is the backlog of what could still be done.

## Deployment architecture

### Not deployed under one parent domain

The 6 apps are currently split across 3 different hosting platforms, each on that platform's own default domain, instead of one shared parent domain (e.g. `*.froncort.ai`):

| Component | Platform | Domain |
|---|---|---|
| identity-service, ticket-service, pr-service | Railway | `*.up.railway.app` |
| audit-service | Render (free tier) | `*.onrender.com` |
| support-hub, review-console | Vercel | `*.vercel.app` |

**Why not one parent domain:** buying and configuring a custom domain (e.g. `froncort.ai` with `app.`, `review.`, `api.` subdomains all under it) was the original plan (`implementation_guide.md`'s original requirement), but was dropped mid-Phase-9 in favor of shipping on each platform's free default domain instead. Two compounding reasons:

1. **Cost/scope** — a custom domain is a recurring cost not justified for a project submission.
2. **Railway's trial-plan resource cap** — 5 provisioned resources **account-wide**, not per-project (confirmed by hitting it twice). This forced audit-service onto a *second* platform (Render) entirely, which means even a custom domain wouldn't have given every service the same parent domain without paying for a second platform's custom-domain feature too, or re-architecting to fit everything back under Railway's cap.

**What this costs functionally:** the refresh-token cookie must be `SameSite=None` (cross-site) rather than scoped to one shared parent domain with `SameSite=Lax`/`Strict`. This works in Chrome (verified live) but Safari's ITP and Firefox's ETP both block third-party cookies by default, which would likely degrade the hosted deployment to "login works, but the session doesn't survive a refresh or a new tab" in those browsers. See `docs/known-limitations.md` for the full technical detail.

**The actual fix, if this project continues:** buy one real domain and put every service under it as a subdomain (`identity.example.com`, `tickets.example.com`, `app.example.com`, `review.example.com`, etc.) — Vercel, Railway, and Render all support custom domains on their free/hobby tiers, so the fix is a domain purchase plus DNS configuration, not a platform upgrade. That would allow `SameSite=Lax`/`Strict` cookies scoped to the shared parent domain, removing the Safari/Firefox third-party-cookie risk entirely.

### Single-platform consolidation

Alternatively, upgrading off Railway's trial plan (or moving all 4 backend services to a single platform with no per-account resource cap) would let every backend service live on one host, simplifying the CORS/cookie story even without a custom domain purchase.

### Clean monorepo-aware deploys

Both Railway's and Vercel's CLI-based deploy (`railway up`, `vercel deploy`) only upload the single target directory passed to them — not the full npm-workspaces monorepo — so `@froncort/shared` and `@froncort/ui` had to be vendored into each deploy as a workaround (self-contained copy + `file:./vendor/...` dependency). Render's GitHub-connected flow didn't need this since it clones the whole repo.

**Improvement:** connect Railway's and Vercel's dashboards directly to the GitHub repo (the way Render already is) and set each service's Root Directory there. Both platforms' git-connected flows clone the full repo and resolve npm workspaces correctly, removing the vendoring hack entirely. Noted as the intended long-term fix if this project is redeployed again (`docs/project-progress.md` Phase 9).

## Verification gaps

- **Safari and Firefox were never tested** against the hosted deployment — only Chrome (the only browser available to the browser-automation tooling used during deployment). Given both browsers' default third-party-cookie blocking, the cross-site `SameSite=None` refresh cookie may not survive a page refresh or new tab in either. Needs a real human test pass before this can be called cross-browser verified.
- **No uptime pinger configured** for audit-service on Render's free tier, which spins down after a period of inactivity. First request after an idle period will cold-start-delay (or in the worst case, silently disrupt) the audit-first blocking mutation flow and the digest cron job. A free pinger (cron-job.org or UptimeRobot) hitting `/health` every ~10 minutes was planned but never set up, since creating a third-party account isn't something an assistant can do on the user's behalf.

## Missing endpoints / UX ceilings (real contract gaps, not polish)

- **No endpoint resolves a `userId` to a display name outside of an org admin's own org.** `Comment.authorId`, `Attachment.uploadedBy`, `Ticket.assignedTo`/`createdBy` are bare UUIDs; `GET /orgs/:id/members` (added Phase 7 patch) only resolves names within the viewer's own org, and only for `ORG_ADMIN`/PSA callers. A `SUPPORT_AGENT`/`REVIEWER`, or anyone viewing a cross-org shared ticket/PR, still sees a truncated-UUID fallback (`Member 3a642d1a…`) instead of a real name. Fixing this properly needs either a new, more permissive name-lookup endpoint, or a documented decision that this stays permanent for cross-org guests.
- **No org directory endpoint.** Both the "request a new connection" form (Support Hub) and `ShareManager` (cross-org ticket/PR sharing, both apps) require the caller to already know the target org's UUID out-of-band — there's no way to search or browse other orgs from the UI. A directory/search endpoint (with appropriate visibility rules — probably not every org should be publicly listable) would remove this UX ceiling.
- **No `GET` for org connections' human-readable partner-org name** — same root cause as the org directory gap above; the connections page and `ShareManager` both show only a truncated org ID for the partner org.
- **`assignedTo` on ticket creation is a free-text UUID input for `SUPPORT_AGENT`** (only `ORG_ADMIN` gets the real member-picker dropdown, since `GET /orgs/:id/members` is `ORG_ADMIN`/PSA-gated). Extending that endpoint's visibility (or adding a narrower "list assignable members" endpoint available to `SUPPORT_AGENT` too) would let every ticket-creating role use the same dropdown.

## Testing

- **No automated Jest/Supertest suite for the first 5 phases of backend work** — Phases 1–5 relied on live curl/Postman verification only, per each phase's own Definition of Done at the time. The automated suite (5 suites / 21 tests as of Phase 8) was backfilled starting Phase 6 and grew incrementally after that; it does not retroactively cover every manually-verified behavior from Phases 1–5 with an automated regression test.
- **No automated test for the audit-first mutation ordering** (a mutation must fail if its audit-log write fails) beyond the one Phase 5 manual verification — `audit-permissions.test.js` was flagged as the intended home for this but its current coverage should be double-checked against that specific ordering guarantee.
- **Mobile-responsive layouts were never tested at a narrow viewport width**, deprioritized per explicit instruction ("if time gets tight, mobile-responsive polish is the first thing to cut"). Tailwind responsive utilities exist in a few places (ticket grid column counts) but there's no verification they render correctly below desktop width.

## Documentation / submission checklist

Per `docs/project-progress.md`'s Phase 9 entry, these were still open as of the last log update:
- Architecture diagram
- `erd.mermaid` (entity-relationship diagram)
- Demo video
- Final assignment-checklist pass (master spec §30)

`docs/setup_guide.md` (this docs pass) closes one item from that list; the diagram, ERD, and demo video remain outstanding.

## Security / dependency hygiene

- **8 `npm audit` findings remain accepted, not fixed** (1 moderate, 6 high, 1 critical as of 2026-07-29) — all transitive, all blocked on upstream packages (`next`'s bundled `postcss`, and `bcrypt`'s native-build chain pulling in outdated `brace-expansion`/`tar`) shipping compatible fixed versions. None are reachable at runtime today, but this should be revisited on every `next` or `bcrypt` upgrade rather than left permanently accepted. Full detail in `docs/known-limitations.md`.
- **CORS was wide open in early phases and locked down in Phase 6** — worth a periodic re-check that `CORS_ALLOWED_ORIGINS` on every deployed service still matches only the real, current frontend URLs (especially after any redeploy that changes a Vercel/Railway/Render URL).
- **`audit_writer`'s production password** was manually regenerated and applied via direct `psql` access rather than through any secrets-management tooling — fine for a single-submission deployment, but a real secrets manager (or at minimum, a documented rotation procedure) would be the next step for anything longer-lived than this.
