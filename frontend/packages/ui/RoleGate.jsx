/**
 * UI-side mirror of the backend's own-org-only + role discipline — this is a
 * presentation-layer convenience, NOT a security boundary (the API enforces
 * every one of these checks independently and will 403/404 regardless of
 * what this component renders). Its job is only to keep the UI from
 * offering an action the API is guaranteed to reject.
 *
 * `isOwner` matters separately from `allow`: a GUEST viewing a ticket shared
 * with their org may hold ORG_ADMIN in their OWN org, but the backend still
 * rejects edit/delete/attach on a ticket that isn't their org's — role alone
 * can't express that, so callers must pass isOwner explicitly wherever a
 * resource can be reached via a cross-org share.
 */
export default function RoleGate({ allow = [], role, isOwner = true, children, fallback = null }) {
  if (!isOwner) return fallback;
  if (allow.length && !allow.includes(role)) return fallback;
  return children;
}
