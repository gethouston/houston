import { join } from "node:path";
import type { HydrateEntry } from "./hydrate-download";
import type { HydrateManifest } from "./hydrate-options";
import { landLink, skipLink } from "./land-link";
import { linkHash } from "./object-attrs";

export async function landListedLinks(
  entries: readonly HydrateEntry[],
  destDir: string,
  manifest: HydrateManifest,
  signal: AbortSignal,
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
    if (!(await landLink(rel, link, join(destDir, ...rel.split("/")))))
      continue;
    manifest.set(rel, { hash: linkHash(link), generation });
  }
}
