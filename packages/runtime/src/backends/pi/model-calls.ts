import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ModelCallTiming } from "@houston/protocol";

export function createPiCallTimer(
  now: () => number = () => performance.now(),
): (event: AgentSessionEvent) => ModelCallTiming | null {
  let requestAt: number | undefined;
  let openedAt: number | undefined;
  let firstBlockAt: number | undefined;
  let firstTokenAt: number | undefined;
  return (e) => {
    if (e.type === "turn_start") {
      requestAt = now();
      openedAt = firstBlockAt = firstTokenAt = undefined;
    } else if (e.type === "auto_retry_start") {
      requestAt = now() + e.delayMs;
      openedAt = firstBlockAt = firstTokenAt = undefined;
    } else if (e.type === "message_start" && e.message.role === "assistant") {
      openedAt ??= now();
    } else if (e.type === "message_update") {
      const t = e.assistantMessageEvent.type;
      if (t === "thinking_start") firstBlockAt ??= now();
      if (t === "text_start" || t === "toolcall_start") {
        const at = now();
        firstBlockAt ??= at;
        firstTokenAt ??= at;
      }
    } else if (e.type === "message_end" && e.message.role === "assistant") {
      const msg = e.message;
      const call =
        requestAt !== undefined &&
        openedAt !== undefined &&
        msg.stopReason !== "error" &&
        msg.stopReason !== "aborted"
          ? {
              provider: msg.provider,
              model: msg.model,
              ttfbMs: Math.max(0, Math.round(openedAt - requestAt)),
              ...(firstTokenAt !== undefined
                ? { firstTokenMs: Math.round(firstTokenAt - openedAt) }
                : {}),
              ...(firstBlockAt !== undefined
                ? { firstBlockMs: Math.round(firstBlockAt - openedAt) }
                : {}),
              inputTokens: msg.usage?.input ?? 0,
              cacheReadTokens: msg.usage?.cacheRead ?? 0,
              cacheWriteTokens: msg.usage?.cacheWrite ?? 0,
              outputTokens: msg.usage?.output ?? 0,
            }
          : null;
      requestAt = openedAt = firstBlockAt = firstTokenAt = undefined;
      return call;
    }
    return null;
  };
}
