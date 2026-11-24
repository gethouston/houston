import { EngineError } from "@houston/runtime-client";
import type { StreamRegistry } from "./stream-registry";

/** One history read and the {@link StreamRegistry.turnsStarted} count it went
 *  out at. A seed compares `mark` with the count now: equal means no turn this
 *  owner started is missing from `value`. `null`: the client was torn down
 *  while the read waited, and nothing may seed from it. */
export interface MarkedRead<T> {
  value: T;
  mark: number | null;
}

/**
 * Read a conversation's history no older than the turns this owner sent on
 * it. A read is overtaken when a turn started while it was out, or when it
 * went out while such a turn's send was not yet accepted
 * ({@link StreamRegistry.ownsUnacceptedSend}): either way its answer may
 * predate the prompt, and seeding it would replace the turn on screen. So it
 * is taken again once that turn let go: by then the host has the prompt and
 * the reply, or refused the send and never will. A read sent after the
 * engine took the send is trusted: the host holds the prompt, and a running
 * turn's stream owns the feed anyway.
 *
 * Waiting matters for the first read a chat opens on. Its caller (a query's
 * first fetch) joins every change event that lands while it is out, so this
 * read is the only one the chat gets until the next change.
 *
 * It reads again for as long as reads keep being overtaken: each pass waits
 * out a whole turn, so it cannot storm. A teardown ends it unseeded.
 */
export async function readPastOwnTurns<T>(
  registry: StreamRegistry,
  key: string,
  read: () => Promise<T>,
): Promise<MarkedRead<T>> {
  const disposals = registry.disposals;
  for (;;) {
    const mark = registry.turnsStarted(key);
    const overtakenAtStart = registry.ownsUnacceptedSend(key);
    const overtaken = () =>
      overtakenAtStart || registry.turnsStarted(key) !== mark;
    let value: T;
    try {
      value = await read();
    } catch (e) {
      if (!isNotFound(e) || !overtaken()) throw e;
      await registry.ownTurnLeft(key);
      if (registry.disposals !== disposals) throw e;
      continue;
    }
    if (registry.disposals !== disposals) return { value, mark: null };
    if (!overtaken()) return { value, mark };
    await registry.ownTurnLeft(key);
    if (registry.disposals !== disposals) return { value, mark: null };
  }
}

const isNotFound = (e: unknown): boolean =>
  e instanceof EngineError && e.status === 404;
