# Known Limitations

Accepted trade-offs and shipped-as-is gaps, each with the reasoning behind not fixing it. For the backlog of things that could still be built or fixed — as opposed to intentionally accepted — see `docs/future_improvements.md`. For getting the project running locally (including seeded demo credentials), see `docs/setup_guide.md`.

## npm audit — accepted transitive vulnerabilities

As of 2026-07-29, `npm audit` at the repo root reports 8 remaining vulnerabilities
(1 moderate, 6 high, 1 critical). All are transitive, all have a patched
version that would require a breaking change to a direct dependency we do not
want to break (`next`), or to unmaintained install-time tooling we don't
control (`bcrypt`'s native build chain). None are reachable at runtime.

### postcss (moderate, XSS / path traversal in CSS stringify + sourcemap loading)

- Path: `next/node_modules/postcss` — bundled inside Next.js itself, not a
  direct dependency of this repo.
- Why it's not fixed: the only available fix (`npm audit fix --force`) would
  downgrade `next` from `15.5.22` to `9.3.3`, which predates the App Router
  and would break everything built since Phase 1.
- Accepted until: Next.js ships a patch release that bundles a newer `postcss`
  internally. Revisit on every `next` upgrade.

### brace-expansion (high, DoS via unbounded expansion) and tar (critical, arbitrary file write via hardlink/symlink path traversal)

- Path: both are transitive dependencies of `bcrypt`'s native build tooling
  (`@mapbox/node-pre-gyp@1.0.11` → `rimraf@3.0.2` → `glob@7.2.3` →
  `minimatch@3.1.5` → `brace-expansion@1.1.17`, and `node-pre-gyp` → `tar@6.2.1`
  directly).
- Why it's not fixed: `npm audit fix` (no `--force`) is a genuine no-op for
  these — confirmed by running it twice, including in verbose mode, with zero
  lockfile changes. The patched versions (`brace-expansion@5.0.8`,
  `tar@7.5.21+`) are both major-version jumps that ship as pure ESM
  (`"type": "module"`). `minimatch@3.1.5` and `node-pre-gyp` still `require()`
  these packages, so forcing the patched versions via `overrides` breaks
  `require()` with `ERR_REQUIRE_ESM` — this would break bcrypt's install/
  rebuild step, not just skip a flag. Fixing this properly requires
  `node-pre-gyp` (or `bcrypt` itself) to ship a version compatible with the
  ESM-only majors, which hasn't happened yet upstream.
- Practical exposure: both packages are install-time-only tooling used to
  fetch/build bcrypt's native binary. Neither is imported or executed at
  application runtime, so there is no runtime attack surface — only a
  supply-chain risk during `npm install`/rebuild on a compromised registry
  or filesystem, which is out of scope for this fix.
- Accepted until: `@mapbox/node-pre-gyp` (or bcrypt's chosen build tool)
  upgrades to support brace-expansion 5.x / tar 7.x. Revisit whenever
  `bcrypt` is upgraded.

## Phase 9 — Deployment architecture and cross-site session cookie

### Hosting layout (final, as deployed 2026-07-31)

Not everything is on one platform — this was a deliberate trade-off, not
drift, made when Railway's trial-plan resource cap (5 provisioned resources
**account-wide**, not per-project — confirmed by hitting it twice, once
creating a 4th backend service and once trying a second project) made
hosting all 4 backend services + Postgres + Redis on Railway alone
infeasible without a card on file.

| Component | Platform | Why |
|---|---|---|
| identity-service, ticket-service, pr-service | Railway | Same project as Postgres/Redis — private network (`*.railway.internal`) connection strings, no public DB exposure needed. |
| Postgres, Redis | Railway | — |
| audit-service | Render (free tier) | Railway's account-wide resource cap was already exhausted by the 5 items above. audit-service runs a background cron scheduler (`startDigestScheduler`) for the AI digest job, which rules out a serverless/Vercel-Functions host — it needs a persistent long-running process, which Render's free web-service tier provides. Connects to Railway's Postgres via its **public proxy connection string** (`sslmode=require` confirmed — `SHOW ssl` returns `on` over that connection), since Render is a separate account/network and can't reach Railway's private `*.railway.internal` hostnames. |
| support-hub, review-console (both Next.js apps) | Vercel | Per `implementation_guide.md`'s explicit "Railway (or Vercel)" allowance. |

Real deployed URLs (2 orgs, seeded demo data, `Password123!` for every
seeded user — see `docs/project-progress.md`'s Phase 9 entry for the full
credential list):
- Support Hub: `https://unified-org-workspace-support-hub.vercel.app`
- Review Console: `https://unified-org-workspace-review-consol.vercel.app`
- identity-service: `https://identity-service-production-6dfc.up.railway.app`
- ticket-service: `https://ticket-service-production-2727.up.railway.app`
- pr-service: `https://pr-service-production.up.railway.app`
- audit-service: `https://unified-org-workspace-audit-service.onrender.com`

**Monorepo caveat for whoever redeploys this:** neither Railway's nor
Vercel's CLI-based deploy (as opposed to their GitHub-connected deploy
flows) uploads the full npm-workspaces monorepo — each only uploads the
single app/service directory passed to `up`/`deploy`, so the private
`@froncort/shared` / `@froncort/ui` workspace packages 404 against the
public npm registry. Worked around by staging a self-contained copy of each
app/service (script: ad hoc, not committed) with the relevant shared
package copied into `vendor/` and the dependency repointed to
`file:./vendor/...` before upload. audit-service, deployed via Render's
**GitHub-connected** flow instead (Render always clones the full repo), did
not need this — its `buildCommand` just `cd`s to the repo root first
(`cd ../.. && npm install && npm run build -w packages/audit-service`).

### Cross-dashboard session sync — actually demonstrable, contrary to the original assumption

The Phase 9 planning note (superseded, see `implementation_guide.md`)
originally assumed session sync would NOT be demonstrable without a shared
parent domain, and budgeted for that as an accepted loss. **Live testing
found this assumption wrong, in the good direction:** logging into Support
Hub (`...support-hub.vercel.app`) and then loading Review Console
(`...review-consol.vercel.app`) in the same browser **without a separate
login** worked — Review Console's dashboard rendered real seeded PR data on
first load. This is because the refresh-token cookie is scoped to
**identity-service's own domain** (`identity-service-production-6dfc.up.railway.app`),
not either frontend's domain — both frontends call the same identity-service
origin for their silent-refresh-on-mount request, so the browser attaches
the cookie regardless of which frontend page initiated the request, as long
as the cookie itself is sendable cross-site. That "sendable cross-site" part
is exactly what `SameSite=None` (via the new `COOKIE_SAME_SITE=none`
production override) buys — full detail below.

### `SameSite=None` production cookie fix — real observed behavior

**The fix:** `packages/identity-service/src/routes/auth.routes.js`'s
`cookieOptions()` now reads `COOKIE_SAME_SITE` (default `'lax'`, unchanged
for local dev; set to `'none'` in Railway's `identity-service` env vars for
this deployment). `secure: true` was already unconditional, which
`SameSite=None` requires anyway.

**Observed in Chrome (Windows), 2026-07-31 — real test, not assumed:**
- Logged into Support Hub, created a real ticket (round-tripped through
  ticket-service → audit-service on Render → Postgres), refreshed the page
  — session persisted, no redirect to login.
- Without a separate login, loaded Review Console — session was already
  active (see cross-dashboard section above). Created a real PR, refreshed
  — session persisted there too.
- Confirmed both audit entries (`TICKET_CREATED`, `PR_CREATED`) appear
  correctly in the unified audit log, and the CSV export endpoint
  (`GET /audit-log?format=csv`) returns real CSV rows for both.
- **Not tested: Safari and Firefox.** The agent doing this deployment only
  had Chrome browser automation available — no Safari or Firefox instance
  to test against. Per Safari's and Firefox's documented default third-
  party-cookie blocking (ITP / Enhanced Tracking Protection), the
  `SameSite=None` cross-site refresh cookie set by identity-service is
  likely to be blocked or evicted early in both, which would silently
  degrade to "login works, but the session doesn't survive a refresh or a
  new tab" in those browsers specifically. **This needs a real human test
  in Safari and/or Firefox before the demo video is recorded** — do not
  assume the Chrome result generalizes. If it fails in either, the fallback
  is: state in the demo video that the hosted deployment is validated in
  Chrome-based browsers, and that cross-site third-party-cookie blocking in
  Safari/Firefox is a known, documented trade-off of not having a shared
  parent domain (see `implementation_guide.md`'s Phase 9 decision note).
  **Status as of this doc update: still not tested** — the real Safari/
  Firefox result is still an open action item. The actual fix (one shared
  parent domain via a purchased custom domain) is tracked as an open item
  in `docs/future_improvements.md`, not repeated here.

### Uptime pinger — not set up

Render's free tier spins down an idle web service after a period of
inactivity, which would cold-start-delay (or in the worst case, silently
break) the first synchronous audit-first mutation call after a period of
no traffic. A free uptime pinger (cron-job.org or UptimeRobot) hitting
`https://unified-org-workspace-audit-service.onrender.com/health` every
~10 minutes was planned but **not set up** — creating a third-party
account is outside what an assistant can do on a user's behalf. **Action
item before the demo/grading window:** sign up for either service and
add this check manually. Also listed in `docs/future_improvements.md`.

## See also

- `docs/future_improvements.md` — backlog of improvements and unimplemented
  features (org directory endpoint, cross-org name resolution, automated
  test backfill for Phases 1–5, single-parent-domain deployment fix, etc.).
- `docs/setup_guide.md` — local setup instructions, including seeded demo
  users/passwords/roles and organization IDs.
