import { isCompactionSummary } from "@houston/protocol";
import type { ChatMessage } from "@houston/runtime-client";
import type { FeedFrame } from "./history";
import { ENGINE_RESUMED_MESSAGE, STOPPED_BY_USER } from "./turn-errors";
import { interruptionNotice, timeLimitNotice } from "./turn-notices";

export function assistantHistory(
  m: ChatMessage,
  mapProvider: (id: string) => string,
  next?: ChatMessage,
): FeedFrame[] {
  const out: FeedFrame[] = [];
  const ts = m.ts;
  const turn = m.turnId !== undefined ? { turnId: m.turnId } : {};
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
  if (m.contextCleared) {
    out.push({ feed_type: "context_cleared", data: null, ts, ...turn });
  }
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
  if (m.thinking) {
    out.push({ feed_type: "thinking", data: m.thinking, ts, ...turn });
  }
  (m.tools ?? []).forEach((t, toolIndex) => {
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
  if (m.content && !isCompactionSummary(m, next))
    out.push({ feed_type: "assistant_text", data: m.content, ts, ...turn });
  if (m.fileChanges) {
    out.push({ feed_type: "file_changes", data: m.fileChanges, ts, ...turn });
  }
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
  if (m.stopped) {
    out.push({
      feed_type: "system_message",
      data: STOPPED_BY_USER,
      ts,
      ...turn,
    });
  }
  if (m.interrupted) {
    const line = m.interrupted.resumed
      ? { kind: "engine_resumed" as const, message: ENGINE_RESUMED_MESSAGE }
      : interruptionNotice(m.interrupted);
    out.push({
      feed_type: "system_message",
      data: line.message,
      notice: line.kind,
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
