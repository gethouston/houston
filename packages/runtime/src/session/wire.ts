import type { WireEvent } from "@houston/runtime-client";

/**
 * Map a pi AgentSession event to our wire event (or null to drop it). Shared
 * by the long-lived server (chat.ts) and the per-turn cloud runtime — the two
 * MUST emit identical frames, since the web client and the control-plane relay
 * speak this one dialect.
 */
export function toWire(e: any): WireEvent | null {
  switch (e.type) {
    case "message_update": {
      const a = e.assistantMessageEvent;
      if (a?.type === "text_delta") return { type: "text", data: a.delta ?? "" };
      if (a?.type === "thinking_delta") return { type: "thinking", data: a.delta ?? "" };
      return null;
    }
    case "tool_execution_start":
      return { type: "tool_start", data: { name: e.toolName, args: e.args } };
    case "tool_execution_end":
      return { type: "tool_end", data: { name: e.toolName, isError: !!e.isError } };
    default:
      return null;
  }
}
