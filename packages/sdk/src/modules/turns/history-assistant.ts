import type { ChatMessage } from "@houston/runtime-client";
import type { FeedFrame } from "./history";
import {
  ENGINE_RESTART_MESSAGE,
  ENGINE_RESUMED_MESSAGE,
  STOPPED_BY_USER,
} from "./turn-errors";
import { timeLimitNotice } from "./turn-notices";

/** Assistant records replay in the same order as their live feed. */
export function assistantHistory(
  m: ChatMessage,
  mapProvider: (id: string) => string,
): FeedFrame[] {
  const out: FeedFrame[] = [];
  const ts = m.ts;
  const turn = m.turnId !== undefined ? { turnId: m.turnId } : {};
  // A persisted provider switch: replay the boundary divider before this
  // turn's content so it survives a reload (and the window estimate resets).
  if (m.providerSwitch) {
    out.push({
      feed_type: "provider_switched",
      data: {
        provider: mapProvider(m.providerSwitch.provider),
        summarized: m.providerSwitch.summarized,
        pre_tokens: m.providerSwitch.pre_tokens,
      },
      ts,
      ...turn,
    });
  }
  // A persisted `/clear` marker: replay the boundary divider so it survives
  // a reload, exactly like a compaction's.
  if (m.contextCleared) {
    out.push({ feed_type: "context_cleared", data: null, ts, ...turn });
  }
  // A persisted compaction: replay the boundary divider so it
  // (and the window reset) survives a reload.
  if (m.compaction) {
    out.push({
      feed_type: "context_compacted",
      data: {
        trigger: m.compaction.trigger,
        pre_tokens: m.compaction.pre_tokens,
      },
      ts,
      ...turn,
    });
  }
  // Replay the turn's reasoning BEFORE its tool calls — the live VM keeps a
  // single thinking entry positioned where the first thinking block streamed
  // (ahead of the tools), so a reload renders the mission log in the same
  // order a live watcher saw (HOU-717).
  if (m.thinking) {
    out.push({ feed_type: "thinking", data: m.thinking, ts, ...turn });
  }
  (m.tools ?? []).forEach((t, toolIndex) => {
    // Tool rows are many-per-turn, so each carries its per-turn index — the
    // pair (turnId, toolIndex) is what a replayed live push dedupes against.
    const index = m.turnId !== undefined ? { toolIndex } : {};
    out.push({
      feed_type: "tool_call",
      data: { name: t.name, input: t.input ?? {} },
      ts,
      ...turn,
      ...index,
    });
    out.push({
      feed_type: "tool_result",
      data: {
        name: t.name,
        content: t.result ?? "",
        is_error: !!t.isError,
        ...(t.mission ? { mission: t.mission } : {}),
      },
      ts,
      ...turn,
      ...index,
    });
  });
  if (m.content)
    out.push({ feed_type: "assistant_text", data: m.content, ts, ...turn });
  // A persisted file-change summary: replay it AFTER the assistant text so
  // the chat attaches it to this turn's assistant message on reload.
  if (m.fileChanges) {
    out.push({ feed_type: "file_changes", data: m.fileChanges, ts, ...turn });
  }
  // A persisted provider failure: replay the typed card so the inline
  // reconnect / rate-limit surface survives a reload. AFTER the turn's
  // thinking/tools/content — the live settle pushes the card last, and a
  // reseed that reordered it above the streamed work read as "the agent is
  // still going" with the failure buried mid-transcript.
  if (m.providerError) {
    out.push({
      feed_type: "provider_error",
      data: {
        ...m.providerError,
        provider: mapProvider(m.providerError.provider),
      },
      ts,
      ...turn,
    });
  }
  // A turn the user interrupted persisted `stopped`: replay the standard
  // "Stopped by user" system line so the transcript reads identically after a
  // reload — the exact copy + position the live stop settle produces
  // (`finishErr`'s system_message, after the turn's text/tools). A stopped
  // turn never carries a `pendingInteraction`, so no card competes with it.
  if (m.stopped) {
    out.push({
      feed_type: "system_message",
      data: STOPPED_BY_USER,
      ts,
      ...turn,
    });
  }
  // A turn the engine died on (`interrupted`, written by the runtime's boot
  // settle): the same authored restart line the lost-terminal settle shows,
  // so a reload reads exactly what the user saw when the engine came back.
  if (m.interrupted) {
    out.push({
      feed_type: "system_message",
      data: m.interrupted.resumed
        ? ENGINE_RESUMED_MESSAGE
        : ENGINE_RESTART_MESSAGE,
      notice: m.interrupted.resumed ? "engine_resumed" : "engine_restart",
      ts,
      ...turn,
    });
  }
  const notice = timeLimitNotice(m.stopReason);
  if (notice) {
    out.push({
      feed_type: "system_message",
      data: notice.message,
      notice: notice.kind,
      ts,
      ...turn,
    });
  }
  if (m.usage) {
    out.push({
      feed_type: "final_result",
      data: {
        result: m.content,
        cost_usd: null,
        duration_ms: null,
        usage: m.usage,
      },
      ts,
      ...turn,
    });
  }
  return out;
}
