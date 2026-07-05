import { realpathSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Per-working-directory turn serialization. The runtime serializes turns
 * WITHIN a conversation (`conv.queue`), but two conversations sharing the same
 * workdir — a user chat and a routine run, or two chats of one agent — could
 * still mutate the same files concurrently and clobber each other. This is the
 * TS port of the Rust engine's `workdir_locks.rs`: same-folder turns QUEUE
 * (routines wait for the live chat turn, issue #362), different folders never
 * contend. It also makes the per-turn file-change diff attributable — no
 * concurrent writer can leak its files into another turn's summary.
 */

const chains = new Map<string, Promise<void>>();

/** Canonicalize so `dir` and `dir/.` (or a symlinked alias) share one lock. */
function lockKey(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return resolve(dir);
  }
}

/**
 * Run `fn` holding the folder's lock, waiting behind any turn that already
 * holds it. Rejections propagate to the caller; the chain itself always
 * advances (a failed turn never wedges the folder).
 */
export function withWorkdirLock<T>(
  dir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = lockKey(dir);
  const prev = chains.get(key) ?? Promise.resolve();
  const run = prev.then(fn);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  chains.set(key, settled);
  // Drop the entry once this run is the tail and done, so the map never
  // accumulates one promise per folder the process ever touched.
  void settled.then(() => {
    if (chains.get(key) === settled) chains.delete(key);
  });
  return run;
}
