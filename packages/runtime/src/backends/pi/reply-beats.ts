import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ReplyBeat } from "../types";

export function createReplyBeatReader(): (
  e: AgentSessionEvent,
) => ReplyBeat | null {
  let named = new Set<number>();
  return (e) => {
    if (e.type === "message_start" && e.message.role === "assistant") {
      named = new Set();
      return null;
    }
    if (e.type === "message_update") {
      const a = e.assistantMessageEvent;
      if (
        a.type !== "toolcall_start" &&
        a.type !== "toolcall_delta" &&
        a.type !== "toolcall_end"
      )
        return null;
      if (named.has(a.contentIndex)) return null;
      const block =
        a.type === "toolcall_end"
          ? a.toolCall
          : a.partial.content[a.contentIndex];
      const name = block?.type === "toolCall" ? block.name : "";
      if (!name) return null;
      named.add(a.contentIndex);
      return { type: "tool_call_start", name };
    }
    if (e.type === "message_end" && e.message.role === "assistant") {
      const m = e.message;
      const endsOnAnswer =
        m.stopReason === "stop" &&
        !m.content.some((c) => c.type === "toolCall");
      return endsOnAnswer ? { type: "answer_end" } : null;
    }
    return null;
  };
}
