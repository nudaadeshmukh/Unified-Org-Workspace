// Role-gate middleware factory. Blanket capability gate only — it answers
// "can this role ever do this kind of action", not "is this their org".
// Org-ownership checks (which return 404, not 403, per CLAUDE.md rule #2)
// happen separately in each service's business-logic layer.
// Share access (GUEST) is never a role here — see CLAUDE.md's CROSS_ORG_GUEST
// convention; use a share-check helper for that path instead.
// isPlatformAdmin always bypasses — but only call requireRole() on a route
// where the api_reference.md contract actually lists "or PSA"; some routes
// (e.g. connection request/response) deliberately exclude PSA and must not
// use this middleware for that gate.

/**
 * @param {...string} allowedRoles
 * @returns {import('express').RequestHandler}
 */
function requireRole(...allowedRoles) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        error: { message: 'Not authenticated', code: 'UNAUTHENTICATED' },
      });
    }
    if (req.user.isPlatformAdmin) {
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
