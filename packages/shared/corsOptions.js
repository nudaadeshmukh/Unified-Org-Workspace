// Locked down at Phase 6 — CORS_ALLOWED_ORIGINS is the only source of truth
// for the allowlist across all 4 services (never `*`). One shared builder so
// all 4 services parse it identically instead of 4 copies drifting apart.
// `credentials: true` is required — identity-service's refresh token is an
// httpOnly cookie, and the frontend must be able to send/receive it
// cross-origin (support-hub on :3000, review-console on :3001, both distinct
// origins from any of the 4 API ports).

/**
 * @returns {import('cors').CorsOptions}
 */
function buildCorsOptions() {
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    origin(origin, callback) {
      // No Origin header at all (curl, server-to-server, same-origin) — not
      // a browser CORS scenario, let it through. Browser-originated requests
      // always send Origin, so this never weakens the actual allowlist
      // enforcement that matters (cross-origin fetch() from a real browser).
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not in CORS_ALLOWED_ORIGINS`));
    },
    credentials: true,
  };
}

module.exports = { buildCorsOptions };
