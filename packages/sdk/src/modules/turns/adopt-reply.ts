import { isPendingInteraction } from "@houston/protocol";
import type { ChatMessage } from "@houston/runtime-client";
import { finishResumed } from "./finish-resumed";
import {
  ENGINE_RESTART_MESSAGE,
  ENGINE_RESUMED_MESSAGE,
  STOPPED_BY_USER,
} from "./turn-errors";
import { timeLimitNotice } from "./turn-notices";
import {
  finishErr,
  finishOk,
  push,
  settleProviderErrorCard,
  type TurnState,
} from "./turn-settle";

/**
 * Settle a turn from the persisted record that concludes it
 * (conclusive-reply.ts), for the settles that read history instead of the
 * live terminal frame (settle-from-history.ts).
 */
export function adoptReply(
  s: TurnState,
  reply: ChatMessage,
  onAdoptTurnId?: (turnId: string) => void,
): void {
  // The persisted reply names the turn this settle recovers. Adopt its id
  // FIRST: the settle's own pushes then carry the identity a later replay
  // dedupes against (HOU-1214), and the sink's callback stamps the optimistic
  // user bubble the lost echo left id-less — the anchor edit-and-resend
  // (PRODUCT-1217) rewinds on.
  if (reply.turnId !== undefined) {
    s.turnId ??= reply.turnId;
    onAdoptTurnId?.(reply.turnId);
  }
  // Only the clean and provider-error settles flush the reasoning.
  foldPersistedTools(s, reply, !reply.stopped && !reply.interrupted);
  if (reply.providerError) {
    // Adopt the persisted partial reply (same guards as the clean path below)
    // so the settle finalizes what streamed before the failure and the card
    // lands below it — never above a bubble still marked streaming.
    if (reply.content) s.text = reply.content;
    if (reply.thinking && !s.thinking) s.thinking = reply.thinking;
    settleProviderErrorCard(s, reply.providerError);
    return;
  }
  // A turn the user interrupted persisted `stopped`. The runtime never publishes
  // a clean `done` for it, so adopting it as a plain reply would render an
  // interrupted turn as a normal successful finish. Route it through the SAME
  // body the live Stop uses — `finishErr` with the verbatim `STOPPED_BY_USER`:
  // it pushes the "Stopped by user" system line, an invisible final, an `error`
  // status with no text, and settles `needs_you`. `stopped` wins over any
  // (illegal) `pendingInteraction` — a stopped turn must never render a card —
  // so this precedes the adopt below.
  if (reply.stopped) {
    finishErr(s, STOPPED_BY_USER);
    return;
  }
  // A turn the ENGINE died on: the runtime's boot settle wrote this reply in
  // place of the one the dead process never persisted. Same body as the dead-
  // turn settle above (`finishErr` → system line + `error` status), with the
  // authored restart copy instead of the generic one — the client's own
  // detection never sees this shape, only a reload after the engine is back.
  if (reply.interrupted) {
    // …unless the engine is already running the turn again by itself: the
    // work is not over, so this settles NEUTRALLY (no error status, no
    // needs_you card) and only accounts for the pause the user saw.
    if (reply.interrupted.resumed) finishResumed(s, ENGINE_RESUMED_MESSAGE);
    else finishErr(s, ENGINE_RESTART_MESSAGE, "engine_restart");
    return;
  }
  s.text = reply.content;
  // Adopt the persisted reasoning only when nothing streamed live — a settle
  // from history must not clobber (or double) what the watcher already saw
  // (finishOk flushes `s.thinking` into the feed).
  if (reply.thinking && !s.thinking) s.thinking = reply.thinking;
  if (reply.usage) s.usage = reply.usage;
  // A turn that ended on an interaction (a question / connect, or an offer)
  // persisted it (runtime, clean path only). Adopt it BEFORE finishOk so the
  // recovered settle carries it onto the terminal `needs_you` persist — the card
  // renders exactly what the live `done` frame we missed would have shown.
  // Guarded: persisted messages outlive code, and a reply written by an older
  // build carries a pre-step interaction shape that must not reach the VM.
  const notice = timeLimitNotice(reply.stopReason);
  if (notice) {
    s.pendingInteraction = null;
    finishOk(s, notice);
    return;
  }
  if (isPendingInteraction(reply.pendingInteraction))
    s.pendingInteraction = reply.pendingInteraction;
  finishOk(s);
}

type PersistedTool = NonNullable<ChatMessage["tools"]>[number];

/**
 * The turn's tool rows from its persisted record that no live frame or sync
 * pushed (the sink's `toolsSeen` / `toolResultsSeen` cursors), each closed
 * with its result. A settle from history otherwise ends the turn with its
 * tool rows missing until a reload, and a started mission's result with them.
 * With `reasoning`, the persisted reasoning goes first, as a live watcher saw
 * it; the settle's own flush then finalizes it in place.
 */
function foldPersistedTools(
  s: TurnState,
  reply: ChatMessage,
  reasoning: boolean,
): void {
  const tools = reply.tools ?? [];
  if (s.toolResultsSeen >= tools.length) return;
  if (reasoning && reply.thinking && !s.thinking) {
    s.thinking = reply.thinking;
    push(s, { feed_type: "thinking_streaming", data: s.thinking });
  }
  // A call pushed live whose result was lost closes first: tools run serially.
  while (s.toolResultsSeen < Math.min(s.toolsSeen, tools.length))
    pushToolResult(s, tools[s.toolResultsSeen]);
  while (s.toolsSeen < tools.length) {
    const tool = tools[s.toolsSeen];
    push(s, {
      feed_type: "tool_call",
      data: { name: tool.name, input: tool.input ?? {} },
      toolIndex: s.toolsSeen,
    });
    s.toolsSeen++;
    pushToolResult(s, tool);
  }
}

function pushToolResult(s: TurnState, tool: PersistedTool): void {
  push(s, {
    feed_type: "tool_result",
    data: {
      name: tool.name,
      content: tool.result ?? "",
      is_error: !!tool.isError,
      ...(tool.mission ? { mission: tool.mission } : {}),
    },
    toolIndex: s.toolResultsSeen,
  });
  s.toolResultsSeen++;
}
