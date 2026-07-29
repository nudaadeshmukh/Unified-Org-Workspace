# Known Limitations

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
