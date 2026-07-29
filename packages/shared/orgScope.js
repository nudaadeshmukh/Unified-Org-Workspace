// The BOLA defense. Every tenant-data query goes through here first — see
// CLAUDE.md rules #1 and #3. Real implementation: Phase 3 (reused by pr-service
// in Phase 4 rather than duplicated).

/**
 * True if the caller's own org owns the resource.
 * @param {string} resourceOrgId
 * @param {string} callerOrgId
 * @returns {boolean}
 */
function ownsResource(resourceOrgId, callerOrgId) {
  throw new Error('orgScope.ownsResource() not implemented — see Phase 3');
}

/**
 * The 4-condition cross-org share check: owns it directly OR has a non-revoked
 * share row for this exact resource ID AND the underlying OrgConnection is
 * still APPROVED. Returns the access level granted, or null if none.
 * @param {{resourceOrgId: string, callerOrgId: string, shareRow: object|null, connectionStatus: string|null}} params
 * @returns {'OWNER'|'VIEW_COMMENT'|null}
 */
function checkShareAccess(params) {
  throw new Error('orgScope.checkShareAccess() not implemented — see Phase 3');
}

module.exports = { ownsResource, checkShareAccess };
