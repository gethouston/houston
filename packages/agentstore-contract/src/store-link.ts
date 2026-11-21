const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/i;

export type ResolvedStoreIr = { irUrl: string } | { error: string };

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost") return true;
  if (h.startsWith("[")) return true;
  if (h.includes(":")) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)) return true;
  if (!h.includes(".")) return true;
  return (
    h.endsWith(".local") || h.endsWith(".localhost") || h.endsWith(".internal")
  );
}

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
