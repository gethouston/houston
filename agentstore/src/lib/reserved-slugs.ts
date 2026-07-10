/**
 * Reserved agent slugs — slugs a published agent may NOT claim because they would
 * shadow a top-level route or are otherwise operationally off-limits.
 *
 * The publish flow (PATCH /api/agents/:id { publish: true }) derives a slug via
 * `slugify(name)` and must reject any result in this set before assigning it.
 *
 * Ported from the Agent Library's reserved-@handles list; the @handle/social-graph
 * entries (followers, following, likes, feed, profiles, …) are dropped because
 * they have no route in the store, while route-colliding and safety words are kept.
 */

const RESERVED = [
  // Actual top-level routes in this app.
  "a",
  "api",
  "claim",
  "schema",
  // Agent namespace words that would read as system routes.
  "agent",
  "agents",
  "new",
  "edit",
  "search",
  "settings",
  // Install / export surface words.
  "install",
  "download",
  "bundle",
  "ir",
  "og",
  "static",
  "assets",
  "public",
  // Auth / session words.
  "login",
  "logout",
  "signin",
  "signup",
  "signout",
  "auth",
  "oauth",
  "callback",
  "session",
  // Operational / marketing pages.
  "about",
  "help",
  "support",
  "docs",
  "status",
  "terms",
  "privacy",
  "legal",
  "contact",
  // Safety / administration.
  "admin",
  "me",
  "moderation",
  "report",
  "abuse",
  "staff",
  "official",
  "verified",
  "root",
  "system",
  "null",
  "undefined",
  "www",
  "mail",
  "ftp",
  // Brand.
  "houston",
] as const;

/** The full reserved set, lowercased and de-duplicated. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set(
  RESERVED.map((s) => s.toLowerCase()),
);

/** True if the proposed slug is reserved (shadows a route or is off-limits).
 *  Input is normalized (trimmed, lowercased). */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.trim().toLowerCase());
}
