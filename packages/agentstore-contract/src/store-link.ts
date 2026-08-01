/**
 * Resolve an "Install from a link" input (a full share link
 * `https://agents.gethouston.ai/a/<slug>` or a bare `<slug>`) into the
 * gateway's public Agent Store IR URL — `<apiBase>/v1/agentstore/agents/<slug>`,
 * the `{agent, ir}` route — or a friendly error the caller surfaces verbatim.
 * The fetch always targets the configured gateway API, never the pasted link's
 * origin. Shared by the host's `/v1/portable/fetch-from-store` route and the
 * browser adapter's direct-from-store fallback, so link policy cannot drift.
 *
 * SSRF policy (transport layer): the pasted share link must be https and
 * credential-free. The host additionally DNS-vets the resolved gateway host
 * before connecting (`portable-from-store-net.ts`) — a server-side privilege
 * guard; browser callers are already confined by their own network sandbox.
 */

/** Store slugs are lowercase alphanumerics with internal hyphens (contract `slugify`). */
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/i;

/** A resolved fetch target, or a human-readable reason it was rejected. */
export type ResolvedStoreIr = { irUrl: string } | { error: string };

/** True when a hostname must never be fetched (loopback / private / internal). */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost") return true;
  if (h.startsWith("[")) return true; // bracketed IPv6 literal
  if (h.includes(":")) return true; // bare IPv6 literal
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)) return true; // IPv4 literal
  if (!h.includes(".")) return true; // single-label (metadata, internal, ...)
  return (
    h.endsWith(".local") || h.endsWith(".localhost") || h.endsWith(".internal")
  );
}

/** Parse a URL and enforce the transport-level SSRF policy. */
function safeUrl(raw: string): URL | { error: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { error: "That does not look like a valid link." };
  }
  if (u.protocol !== "https:") {
    return { error: "The link must start with https://." };
  }
  if (u.username || u.password) {
    return { error: "The link must not contain a username or password." };
  }
  if (isBlockedHost(u.hostname)) {
    return { error: "That link points to an address we cannot open." };
  }
  return u;
}

/** Extract `<slug>` from a `/a/<slug>` share-link path, if it is one. */
function slugFromSharePath(pathname: string): string | null {
  const m = pathname.match(/^\/a\/([^/]+)\/?$/);
  if (!m) return null;
  const slug = decodeURIComponent(m[1] ?? "");
  return SLUG.test(slug) ? slug : null;
}

export function resolveStoreIrUrl(
  input: string,
  apiBase: string,
): ResolvedStoreIr {
  const trimmed = input.trim();
  if (!trimmed) return { error: "Paste the agent's share link." };

  let slug: string;
  // Anything carrying a scheme is treated as a URL, so a typo'd `http://` is
  // rejected outright rather than mistaken for a bare slug. Only the slug is
  // taken from it — the fetch always targets the configured gateway, not the
  // pasted link's origin.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    const url = safeUrl(trimmed);
    if ("error" in url) return url;
    const parsed = slugFromSharePath(url.pathname);
    if (!parsed) return { error: "That is not a Houston agent share link." };
    slug = parsed;
  } else if (SLUG.test(trimmed)) {
    slug = trimmed;
  } else {
    return { error: "That is not a valid agent link or name." };
  }

  const base = safeUrl(apiBase);
  if ("error" in base) {
    return { error: "The agent store address is not configured correctly." };
  }
  return { irUrl: `${base.origin}/v1/agentstore/agents/${slug}` };
}
