// The BOLA defense. Every tenant-data query goes through here first — see
// CLAUDE.md rules #1 and #3. Both functions are pure (no I/O) so they're
// directly unit-testable without mocking Prisma or a network call — the
// caller (ticket-service, later pr-service) is responsible for fetching
// whatever DB rows / internal-API responses these need, then handing them
// in as plain data.

/**
 * True if the caller's own org owns the resource. Cheap, no I/O — callers
 * should try this first before paying for a share-row lookup + internal
 * connection-status call.
 * @param {string} resourceOrgId
 * @param {string} callerOrgId
 * @returns {boolean}
 */
function ownsResource(resourceOrgId, callerOrgId) {
  return resourceOrgId === callerOrgId;
}

/**
 * The full 5-step cross-org permission check from the master spec, as one
 * reusable function:
 *   1. own org                              -> 'OWNER'
 *   2. share exists (a row for this org)    -> otherwise null
 *   3. that share is not revoked            -> otherwise null
 *   4. the underlying connection is APPROVED -> otherwise null
 *   5. grants view+comment only             -> 'VIEW_COMMENT'
 *
 * Step 1 is included here (not just left to `ownsResource`) so this one
 * function is the single, authoritative answer to "what can this caller do
 * with this resource" — callers may still call `ownsResource` first purely
 * as a cheap short-circuit to skip fetching share/connection data, but they
 * must not skip calling this function for the final decision.
 *
 * A share row alone is never sufficient on its own if the connection was
 * later revoked (CLAUDE.md rule #3) — that's why `connectionApproved` is a
 * required, separate input rather than something inferred from the share
 * row itself.
 *
 * @param {{
 *   resourceOrgId: string,
 *   callerOrgId: string,
 *   shareRow: {revokedAt: Date|string|null}|null,
 *   connectionApproved: boolean,
 * }} params
 * @returns {'OWNER'|'VIEW_COMMENT'|null}
 */
function checkShareAccess({ resourceOrgId, callerOrgId, shareRow, connectionApproved }) {
  if (ownsResource(resourceOrgId, callerOrgId)) {
    return 'OWNER';
  }
  if (!shareRow) {
    return null;
  }
  if (shareRow.revokedAt) {
    return null;
  }
  if (!connectionApproved) {
    return null;
  }
  return 'VIEW_COMMENT';
}

module.exports = { ownsResource, checkShareAccess };
