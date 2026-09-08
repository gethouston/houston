import type { HarnessSession } from "../backends/types";
import { compactWithFactHarvest } from "./durable-facts-harvest";

/**
 * THE AUTOCOMPACT FAILURE GUARD — what keeps a conversation whose compaction
 * cannot succeed from being wedged shut.
 *
 * Compaction is a MODEL CALL, and every backend can refuse one. The Claude
 * Agent SDK backend's summarize-and-restart throws outright when the session
 * holds too little to summarize, when the provider fails, when the summarizer
 * answers with nothing, or when the credential cannot be refreshed
 * (backends/claude/compact.ts); pi's summarizer can be rate-limited the same
 * way (the input-size half of that is handled inside compaction-guard.ts).
 * The context fill only drops on SUCCESS, so an unguarded autocompact turns one
 * refusal into a permanently broken chat: the fill stays over the threshold,
 * the next turn re-enters the same compaction, dies at the same step, and the
 * user can never send another message.
 *
 * So a failed autocompact never fails the turn. It is reported ONCE, the
 * conversation is held off compaction for a cooldown, and the turn runs on
 * against the still-full context — which usually succeeds (the threshold fires
 * at 93% of the window, so there is headroom), and when it does not the user
 * gets the provider's own honest error instead of a summarization failure.
 *
 * `/compact` is deliberately NOT routed through here: a compaction the user
 * asked for must report its failure to the person who asked
 * (conversation-command-run.ts).
 */

/** pi's refusal when a session holds too little to summarize; the Claude
 *  backend reuses the sentence verbatim (backends/claude/compact.ts). */
const NOTHING_TO_COMPACT = /nothing to compact/i;

/**
 * Whether a compaction failure is only "this chat is too short to summarize" —
 * the ORDINARY state of a fresh conversation (and of a session rebuilt under a
 * fill Houston still reads high), never a fault. Shared with the `/clear`
 * harvest so both paths draw the same line between noise and a real failure.
 */
export function isNothingToCompact(message: string): boolean {
  return NOTHING_TO_COMPACT.test(message);
}

/**
 * How long a conversation waits before attempting autocompact again after a
 * failure: long enough that a doomed summarization is not re-paid on every
 * turn, short enough that a transient refusal (a rate limit, a network blip)
 * costs the chat one compaction cycle rather than its afternoon.
 */
export const AUTOCOMPACT_COOLDOWN_MS = 5 * 60_000;

/** conversationId → the moment its next autocompact attempt is allowed. */
const coolingUntil = new Map<string, number>();

/** Test seam: forget every recorded failure. */
export function resetAutocompactCooldownsForTest(): void {
  coolingUntil.clear();
}

/**
 * Compact `session` proactively, fact harvest included (durable-facts-harvest.ts).
 *
 * Returns whether the context was actually compacted. `false` means the turn
 * must proceed uncompacted — the conversation is inside a cooldown from an
 * earlier failure, or this attempt just failed. Never throws.
 */
export async function runAutocompact(
  session: HarnessSession,
  conversationId: string,
  now: number = Date.now(),
): Promise<boolean> {
  // Expired entries are dropped on every pass, so the map holds only the
  // conversations currently cooling down.
  for (const [id, until] of coolingUntil) {
    if (until <= now) coolingUntil.delete(id);
  }
  if (coolingUntil.has(conversationId)) return false;
  try {
    await compactWithFactHarvest(session, conversationId);
    return true;
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    coolingUntil.set(conversationId, now + AUTOCOMPACT_COOLDOWN_MS);
    if (isNothingToCompact(why)) {
      console.info(
        `[autocompact] ${conversationId}: nothing to compact yet; the turn proceeds uncompacted:`,
        why,
      );
    } else {
      // console.error is the runtime's report path (main.ts feeds it to
      // Sentry). Once per cooldown, never once per turn.
      console.error(
        `[autocompact] ${conversationId}: compaction failed; the turn proceeds uncompacted and no further attempt is made for ${AUTOCOMPACT_COOLDOWN_MS / 60_000} minutes:`,
        why,
      );
    }
    return false;
  }
}
