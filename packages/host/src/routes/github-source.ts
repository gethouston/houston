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

  const candidate = (afterHost.split(/\s+/)[0] ?? "").split(/[?#]/)[0] ?? "";

  const segments = candidate.split("/").filter(Boolean);
  const owner = segments[0];
  const repo = segments[1]?.replace(/\.git$/, "");
  if (!owner || !repo) return null;

  if (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo))
    return null;
  return `${owner}/${repo}`;
}
