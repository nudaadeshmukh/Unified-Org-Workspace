// Role-gate middleware factory. Blanket capability gate only — it answers
// "can this role ever do this kind of action", not "is this their org".
// Org-ownership checks (which return 404, not 403, per CLAUDE.md rule #2)
// happen separately in each service's business-logic layer.
// Share access (GUEST) is never a role here — see CLAUDE.md's CROSS_ORG_GUEST
// convention; use a share-check helper for that path instead.
//
// PSA bypass is an explicit, opt-in parameter, fail-safe by default — per
// CLAUDE.md's "Platform Super Admin scope" section. `allowPlatformAdmin`
// defaults to `false`: a route that forgets to pass this option gets the
// SAFE behavior (no PSA bypass), not a silent security hole. Every call
// site — in every service, including identity-service's own routes — must
// state its intent explicitly in both directions: pass
// `{ allowPlatformAdmin: true }` where api_reference.md's role column
// actually lists PSA (identity-service's org/member/connection-listing
// routes), and `{ allowPlatformAdmin: false }` (or just omit the option)
// everywhere else. ticket-service and pr-service: PSA has no ticket/PR
// visibility anywhere, in any org — api_reference.md never lists PSA in
// either service's role tables.
//
// This defaulted the other way (allowPlatformAdmin: true unless overridden)
// for the first version of this file, discovered during Phase 3 to be the
// wrong default: an opt-out-of-bypass design means any future route in any
// service that simply forgets the option silently inherits a PSA bypass
// nobody documented — the exact bug Phase 3 caught and fixed for
// ticket-service, except fail-*unsafe* instead of fail-safe. Flipped.

/**
 * @param {string[]} allowedRoles
 * @param {{allowPlatformAdmin?: boolean}} [options]
 * @returns {import('express').RequestHandler}
 */
function requireRole(allowedRoles, options = {}) {
  const allowPlatformAdmin = options.allowPlatformAdmin === true;

  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        error: { message: 'Not authenticated', code: 'UNAUTHENTICATED' },
      });
    }
    if (allowPlatformAdmin && req.user.isPlatformAdmin) {
      return next();
    }
    if (!req.user.orgRole || !allowedRoles.includes(req.user.orgRole)) {
      return res.status(403).json({
        error: { message: 'You do not have permission to perform this action', code: 'FORBIDDEN' },
      });
    }
    return next();
  };
}

module.exports = requireRole;
