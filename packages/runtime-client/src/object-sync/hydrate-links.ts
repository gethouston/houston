import { join } from "node:path";
import type { HydrateEntry } from "./hydrate-download";
import type { HydrateManifest } from "./hydrate-options";
import { landLink, skipLink } from "./land-link";
import { linkHash } from "./object-attrs";

export function underLink(rel: string, links: ReadonlySet<string>): boolean {
  if (links.size === 0) return false;
  const segments = rel.split("/");
  for (let end = 1; end < segments.length; end += 1)
    if (links.has(segments.slice(0, end).join("/"))) return true;
  return false;
}

export function outsideLinks(
  entries: readonly HydrateEntry[],
  links: ReadonlySet<string>,
): HydrateEntry[] {
  return entries.filter(({ rel, link }) => {
    if (link !== undefined || !underLink(rel, links)) return true;
    skipLink(rel, "is a file inside a link");
    return false;
  });
}

export async function landListedLinks(
  entries: readonly HydrateEntry[],
  destDir: string,
  manifest: HydrateManifest,
  signal: AbortSignal,
  landed: Set<string>,
): Promise<void> {
  const links = entries.filter((entry) => entry.link !== undefined);
  if (links.length === 0) return;
  const folders = new Set<string>();
  for (const { rel, link } of entries) {
    if (link !== undefined) continue;
    const segments = rel.split("/");
    for (let end = 1; end < segments.length; end += 1)
      folders.add(segments.slice(0, end).join("/"));
  }
  for (const { rel, link, generation } of links) {
    if (signal.aborted) return;
    if (link === undefined) continue;
    if (folders.has(rel)) {
      skipLink(rel, "is also a folder in the store");
      continue;
    }
    if (underLink(rel, landed)) {
      skipLink(rel, "is inside another link");
      continue;
    }
    if (!(await landLink(rel, link, join(destDir, ...rel.split("/")))))
      continue;
    landed.add(rel);
    manifest.set(rel, { hash: linkHash(link), generation });
  }
}
