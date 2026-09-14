import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The predecessor-drain handshake object (PRODUCT-1783). On a Kubernetes
 * eviction the ReplicaSet creates the replacement pod ~1s after the old pod
 * gets SIGTERM, while the old pod keeps draining its running turn for minutes;
 * a replacement that hydrates inside that window settles a turn that is still
 * alive elsewhere and its final sync then loses the finished reply. The
 * draining pod publishes this stamp so the replacement can wait the window out.
 *
 * It lives at the sync ROOT, so its rootDir-relative path is also its store
 * key, and the name is matched by neither STORE_SYNC_EXCLUDES nor the
 * runtime-client DEFAULT_EXCLUDES — it must ride the normal sync passes to be
 * uploaded on the drain flush and rewritten by the final sync.
 *
 * A finished drain EXPIRES the stamp (until = now) rather than deleting it:
 * an upload is never held back by the delete pass's conflict rules, and a
 * stamp that hydrates back with the tree is then inert instead of something
 * every later boot has to sweep.
 */
export const DRAIN_STAMP_FILE = ".houston-drain.json";

export interface DrainStamp {
  /** Epoch ms the drain began. */
  since: number;
  /** Epoch ms past which the predecessor is gone whatever the stamp says. */
  until: number;
}

export function drainStampPath(rootDir: string): string {
  return join(rootDir, DRAIN_STAMP_FILE);
}

export async function writeDrainStamp(
  rootDir: string,
  stamp: DrainStamp,
): Promise<void> {
  await writeFile(drainStampPath(rootDir), JSON.stringify(stamp), "utf8");
}

/**
 * Mark the drain over: `until` becomes `now`, so a booting replacement reads
 * an expired window and hydrates at once. The final sync uploads the rewrite.
 * A missing or unreadable stamp is written fresh with a zero-length window.
 */
export async function expireDrainStamp(
  rootDir: string,
  now: number,
): Promise<void> {
  let since = now;
  try {
    since = (await readDrainStampFile(drainStampPath(rootDir)))?.since ?? now;
  } catch {
    // No stamp on disk (a boot that never published one): write the expired
    // stamp anyway so the store copy, if any, is overwritten.
  }
  await writeDrainStamp(rootDir, { since, until: now });
}

export async function readDrainStampFile(
  file: string,
): Promise<DrainStamp | undefined> {
  return parseDrainStamp(await readFile(file, "utf8"));
}

/** Anything that is not two finite epoch-ms numbers is not a stamp. */
export function parseDrainStamp(text: string): DrainStamp | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const { since, until } = parsed as Partial<DrainStamp>;
  if (typeof since !== "number" || !Number.isFinite(since)) return undefined;
  if (typeof until !== "number" || !Number.isFinite(until)) return undefined;
  return { since, until };
}
