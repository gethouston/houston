/**
 * Which old tool results to take out of what is sent to the model.
 *
 * The model needs a tool result on the request that reads it and rarely after:
 * by then it has answered from it. But every result rides along on every later
 * request until the chat compacts, so a few big app payloads early in a chat
 * were most of what each later request paid for. A cleared result is replaced
 * by a stub naming the tool, its size and the file the full result is saved in
 * (./spill.ts), so the model can still read it again when it needs to.
 *
 * Clearing rewrites the request's prefix, which costs one prompt-cache miss.
 * So results are cleared in batches: nothing changes until the stale results
 * not yet cleared add up to {@link BATCH_CHARS}, then all of them go at once,
 * and the prefix stays the same, and cached, until the next batch.
 *
 * The decision is a pure function of the history, replayed round by round, so
 * a backend that keeps no state (pi transforms the full history before every
 * request) reaches the same answer on every request and never un-clears.
 */

/** Tool rounds kept whole: the model may still be working from them. */
const KEEP_RECENT_ROUNDS = 3;

/** A result this small costs less than the cache miss its clearing causes. */
export const MIN_CLEAR_CHARS = 2_000;

/** About 30k tokens of stale results per batch. */
const BATCH_CHARS = 120_000;

/** What the policy reads about one tool result. */
export interface ToolResultRef {
  id: string;
  /** Index of the assistant message, among those that called tools, that asked for it. */
  round: number;
  /** The result's size as the model would see it uncleared. */
  chars: number;
}

/**
 * The ids to clear, given every result so far and the number of tool rounds.
 * The next request follows round `rounds - 1`, whose results it is about to
 * read, so the newest rounds are never cleared.
 */
export function staleResultIds(
  results: readonly ToolResultRef[],
  rounds: number,
): Set<string> {
  let clearedThrough = -1;
  for (let round = 0; round < rounds; round++) {
    const staleThrough = round - KEEP_RECENT_ROUNDS;
    if (staleThrough <= clearedThrough) continue;
    let pending = 0;
    for (const r of results) {
      if (r.round > clearedThrough && r.round <= staleThrough && clearable(r))
        pending += r.chars;
    }
    if (pending >= BATCH_CHARS) clearedThrough = staleThrough;
  }
  return new Set(
    results
      .filter((r) => r.round <= clearedThrough && clearable(r))
      .map((r) => r.id),
  );
}

function clearable(r: ToolResultRef): boolean {
  return r.chars >= MIN_CLEAR_CHARS;
}

const STUB = /^\[Cleared tool result: [^,\]]+, ([\d,]+) characters\. /;

/** The text a cleared result is replaced with. */
export function clearedStub(
  toolName: string,
  chars: number,
  savedAt: string,
): string {
  return `[Cleared tool result: ${toolName}, ${chars.toLocaleString("en-US")} characters. It was removed from the conversation to save space. The full result is saved at ${savedAt} (relative to your working directory); read that file if you need it again.]`;
}

/** The original size a stub records, or undefined when `text` is no stub. */
export function stubbedChars(text: string): number | undefined {
  const match = STUB.exec(text);
  return match?.[1] ? Number(match[1].replaceAll(",", "")) : undefined;
}
