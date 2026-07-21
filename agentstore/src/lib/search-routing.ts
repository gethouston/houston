/**
 * Where the header search box sends the user. A leading `@` that spells a valid
 * creator handle jumps straight to that creator's public page (`/@handle`, which
 * the middleware rewrites to `/creators/handle`); anything else runs as a catalog
 * search (`/explore?q=…`). Pure and framework-free so it is unit-testable and can
 * back both the no-JS `<form action="/explore">` fallback and the client-side
 * `router.push` enhancement.
 */
import { HANDLE_REGEX, normalizeHandle } from "@houston/agentstore-contract";

/**
 * Resolve a raw search string to the href it should navigate to.
 * - `@handle` (valid grammar) → `/@handle` (the canonical creator URL).
 * - `@garbage` (fails the grammar) → treated as a plain query, not a dead link.
 * - anything else → `/explore?q=…`, or bare `/explore` when empty.
 */
export function resolveSearchTarget(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("@")) {
    const handle = normalizeHandle(trimmed);
    if (HANDLE_REGEX.test(handle)) return `/@${handle}`;
  }
  return trimmed ? `/explore?q=${encodeURIComponent(trimmed)}` : "/explore";
}
