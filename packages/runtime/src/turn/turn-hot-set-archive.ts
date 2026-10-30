import type { HydrateListedObject } from "@houston/runtime-client/object-sync";

/**
 * How many of a turn's own archive segments hydrate before the prompt: the
 * newest ones. A routine digest reads only ROUTINE_REPLAY_TAIL messages
 * (session/routine-replay.ts), which the live tail plus these nearly always
 * hold. Older segments stay remote, listed, never in the manifest (so never
 * read as deleted), and a reader reaching back fetches them on demand
 * (turn-archive-fetch.ts). The gateway inlines the same newest segments into
 * the turn's prefetch (cloud internal/pooldispatch/prefetch.go): keep the
 * two counts identical.
 */
export const EAGER_ARCHIVE_SEGMENTS = 2;

const SEGMENT = /^(\d+)\.json$/;

/** The newest `EAGER_ARCHIVE_SEGMENTS` segment keys listed under `archiveRel`. */
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
