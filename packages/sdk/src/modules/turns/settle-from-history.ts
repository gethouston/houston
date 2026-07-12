import { isPendingInteraction } from "@houston/protocol";
import type { ChatMessage } from "@houston/runtime-client";
import {
  finishErr,
  finishOk,
  push,
  settleProviderErrorCard,
  type TurnState,
} from "./turn-settle";

/**
 * Settling a turn whose terminal frame was LOST — the reconnect resynced and
 * the turn is over, so persisted history (complete once a turn ends) is the
 * settle source. The live-frame settles live in turn-settle.ts.
 */

/**
 * A turn that died without persisting a reply — the same copy the host's
 * dead-pump reaper stamps on the terminal `error` frame it synthesizes
 * (`packages/host/src/turn/relay-dialect.ts` TURN_DIED_MESSAGE), so the
 * surface reads identically whether the server or this client detected it.
 */
export const TURN_DIED_MESSAGE = "The turn ended unexpectedly";

/**
 * Settle a turn whose terminal frame was lost. With a known `turnId` the
 * settle is exact: adopt the assistant message persisted FOR THIS TURN
 * (text/usage/providerError); no such message means the turn died before
 * persisting a reply — an error surface with the server's own dead-turn
 * copy, NEVER an empty "completed" render.
 *
 * Without turn ids (legacy servers / old histories) fall back to the trailing
 * assistant message gated by `guard` — a heuristic with a known weakness:
 * turn mode matches the newest user message against the prompt, so two
 * identical prompts in a row can adopt the PREVIOUS turn's reply. When the
 * guard rejects, the streamed accumulation is all there is: settle it as
 * completed when text was streamed, else as the dead-turn error.
 */
export function settleFromHistory(
  s: TurnState,
  messages: ChatMessage[] | null,
  turnId: string | undefined,
  guard: (messages: ChatMessage[]) => boolean,
): void {
  if (messages && turnId) {
    const reply = messages.find(
      (m) => m.role === "assistant" && m.turnId === turnId,
    );
    if (reply) {
      adoptReply(s, reply);
      return;
    }
    finishErr(s, TURN_DIED_MESSAGE);
    return;
  }
  if (messages) {
    // Legacy fallback: no turn ids anywhere — trailing reply + guard.
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && guard(messages)) {
      adoptReply(s, last);
      return;
    }
  }
  // History reload failed, or the legacy guard rejected the trailing reply:
  // the streamed accumulation is all there is.
  if (s.text) finishOk(s);
  else finishErr(s, TURN_DIED_MESSAGE);
}

function adoptReply(s: TurnState, reply: ChatMessage): void {
  if (reply.providerError) {
    settleProviderErrorCard(s, reply.providerError);
    return;
  }
  s.text = reply.content;
  // Adopt the persisted reasoning only when nothing streamed live — a settle
  // from history must not clobber (or double) what the watcher already saw
  // (finishOk flushes `s.thinking` into the feed).
  if (reply.thinking && !s.thinking) s.thinking = reply.thinking;
  if (reply.usage) s.usage = reply.usage;
  // A turn that ended asking the user for something persisted its interaction
  // (runtime, clean path only). Adopt it BEFORE finishOk so a settle from
  // history splits to `needs_you` with the interaction — matching the live
  // `done` frame we missed — instead of collapsing to a false `done`.
  // Guarded: persisted messages outlive code, and a reply written by an older
  // build carries a pre-step interaction shape that must not reach the VM.
  if (isPendingInteraction(reply.pendingInteraction))
    s.pendingInteraction = reply.pendingInteraction;
  finishOk(s);
}

/**
 * The PRE-SETTLED poll's settle source: a turn that finished BEFORE our
 * subscription's first sync (no frames ever replayed, only a fresh idle sync).
 * Unlike {@link settleFromHistory} — which is entered on a CONFIRMED
 * lost-terminal (a boundary / resync) and therefore falls through to
 * `finishErr(TURN_DIED)` when it finds no reply — this settle is SPECULATIVE:
 * a fresh idle sync in turn mode is ALSO the normal "turn we're about to
 * trigger" shape, so a turn that simply hasn't produced its reply yet must NOT
 * be errored. It settles ONLY on conclusive proof the turn is over — a reply
 * for our exact `turnId`, or (legacy, no ids) a trailing assistant message the
 * `guard` accepts as ours — and returns `true` iff it did. Inconclusive (a
 * trailing USER message, a guard reject, a failed reload, or live evidence that
 * arrived mid-reload) returns `false` and settles nothing: the poll re-arms and
 * the stream stays the authority.
 */
export async function presettleFromHistory(
  s: TurnState,
  reloadHistory: () => Promise<ChatMessage[]>,
  turnId: string | undefined,
  guard: (messages: ChatMessage[]) => boolean,
  hasEvidence: () => boolean,
): Promise<boolean> {
  let messages: ChatMessage[];
  try {
    messages = await reloadHistory();
  } catch {
    // A speculative background reload — swallow and re-arm, never surface noise
    // on every poll tick. A genuinely lost stream is owned by the reconnect
    // budget, which settles the turn on its own.
    return false;
  }
  // Live evidence landed while we were reloading, or another path already
  // settled: the stream now owns the turn — never settle from a stale poll.
  if (s.settled || hasEvidence()) return false;
  const reply = conclusiveReply(messages, turnId, guard);
  if (!reply) return false;
  adoptReply(s, reply);
  return true;
}

/**
 * The one message that PROVES the turn is over, or null (inconclusive). With a
 * turnId it must be the reply persisted FOR THIS TURN; without one (legacy) the
 * trailing message must be an assistant reply the `guard` accepts as ours.
 */
function conclusiveReply(
  messages: ChatMessage[],
  turnId: string | undefined,
  guard: (messages: ChatMessage[]) => boolean,
): ChatMessage | null {
  if (turnId) {
    return (
      messages.find((m) => m.role === "assistant" && m.turnId === turnId) ??
      null
    );
  }
  const last = messages[messages.length - 1];
  if (last?.role === "assistant" && guard(messages)) return last;
  return null;
}

/**
 * Refetch history and settle from it (`settleFromHistory`), then stop the
 * subscription. A failed reload surfaces as a system message (no silent
 * fallback) and the settle proceeds from the streamed accumulation — the UI
 * must never hang.
 */
export async function reloadAndSettle(
  s: TurnState,
  reloadHistory: () => Promise<ChatMessage[]>,
  turnId: string | undefined,
  guard: (messages: ChatMessage[]) => boolean,
  stop: () => void,
): Promise<void> {
  let messages: ChatMessage[] | null = null;
  try {
    messages = await reloadHistory();
  } catch (e) {
    push(s, {
      feed_type: "system_message",
      data: `Couldn't reload the conversation: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  if (!s.settled) settleFromHistory(s, messages, turnId, guard);
  stop();
}
