import type { HydrateListedObject } from "@houston/runtime-client/object-sync";

export const EAGER_ARCHIVE_SEGMENTS = 2;

const SEGMENT = /^(\d+)\.json$/;

export function newestArchiveSegments(
  listing: readonly HydrateListedObject[],
  archiveRel: string,
): Set<string> {
  const within = `${archiveRel}/`;
  const numbered: [number, string][] = [];
  for (const { rel } of listing) {
    if (!rel.startsWith(within)) continue;
    const n = SEGMENT.exec(rel.slice(within.length))?.[1];
    if (n !== undefined) numbered.push([Number(n), rel]);
  }
  return new Set(
    numbered
      .toSorted((a, b) => b[0] - a[0])
      .slice(0, EAGER_ARCHIVE_SEGMENTS)
      .map(([, rel]) => rel),
  );
}
