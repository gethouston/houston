/**
 * Extract a GitHub `owner/repo` from arbitrary user-supplied input: the short
 * form, full URLs (`.git`, `/tree/main`, `?query`, `#frag` tolerated), the SSH
 * form (`git@github.com:owner/repo`), or a whole pasted shell command — by
 * anchoring on the `github.com` host wherever it appears. Returns null when no
 * owner/repo shape can be recovered, so the agent-config install (HOU-440)
 * answers a typed 400 instead of firing a doomed GitHub lookup.
 */
export function normalizeSource(source: string): string | null {
  const trimmed = source.trim().replace(/^["'`]+|["'`]+$/g, "");

  let afterHost = trimmed;
  for (const marker of ["github.com/", "github.com:"]) {
    const idx = trimmed.indexOf(marker);
    if (idx !== -1) {
      afterHost = trimmed.slice(idx + marker.length);
      break;
    }
  }

  // A pasted command carries trailing args; a URL may carry a query or
  // fragment. Keep the first whitespace token, truncated at any `?`/`#`.
  const candidate = (afterHost.split(/\s+/)[0] ?? "").split(/[?#]/)[0] ?? "";

  const segments = candidate.split("/").filter(Boolean);
  const owner = segments[0];
  const repo = segments[1]?.replace(/\.git$/, "");
  if (!owner || !repo) return null;

  // GitHub's allowed charsets: owner `[A-Za-z0-9-]`, repo `[A-Za-z0-9._-]`.
  if (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo))
    return null;
  return `${owner}/${repo}`;
}
