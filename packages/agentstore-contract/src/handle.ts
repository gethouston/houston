/**
 * Creator @handle grammar, normalization, and the reserved-word list — the
 * client-side mirror of the authoritative Go rules in
 * `cloud/internal/agentstore/profiles.go` (`handleRegexp`, `reservedHandles`).
 * Kept dependency-light so every store surface (Next.js catalog, engine client,
 * publish adapter) validates a handle the same way BEFORE it reaches the gateway.
 * The gateway remains the sole authority on uniqueness; these checks only cover
 * grammar and reservation, which are decidable in isolation.
 */

/**
 * The creator @handle grammar (mirrors Go `handleRegexp`): 2–30 characters,
 * lowercase, starting alphanumeric, then alphanumerics and underscores. The
 * leading @ is never part of the stored handle — normalize first.
 */
export const HANDLE_REGEX = /^[a-z0-9][a-z0-9_]{1,29}$/;

/**
 * Canonicalize a raw handle the user typed: trim surrounding whitespace, strip a
 * single leading `@`, and lowercase. The result is what {@link HANDLE_REGEX} and
 * {@link RESERVED_HANDLES} are checked against, and what the gateway is sent.
 */
export function normalizeHandle(raw: string): string {
  let handle = raw.trim();
  if (handle.startsWith("@")) handle = handle.slice(1);
  return handle.toLowerCase();
}

/**
 * Handles no creator may claim: product/route/impersonation words the store
 * keeps for itself. A byte-for-byte copy of the Go `reservedHandles` set; a
 * handle is lowercase by grammar, so the set is stored lowercase and membership
 * is checked after {@link normalizeHandle}.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "www",
  "houston",
  "gethouston",
  "agents",
  "agent",
  "store",
  "support",
  "help",
  "about",
  "settings",
  "me",
  "creators",
  "creator",
  "a",
  "c",
  "null",
  "undefined",
  "root",
  "moderator",
  "mod",
  "official",
  "staff",
  "team",
  "verify",
  "verified",
  "system",
  "security",
  "billing",
  "login",
  "logout",
  "signin",
  "signup",
  "dashboard",
  "explore",
]);
