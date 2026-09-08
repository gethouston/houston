import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * Shape reads over the Claude Agent SDK's message union that the turn loop
 * needs but the SDK does not expose as type guards.
 */

/** A main-thread `message_start` stream event — the start of one API response. */
export function isAssistantMessageStart(msg: SDKMessage): boolean {
  return (
    msg.type === "stream_event" &&
    msg.parent_tool_use_id === null &&
    msg.event?.type === "message_start"
  );
}

export function hasSessionId(
  msg: SDKMessage,
): msg is SDKMessage & { session_id: string } {
  return (
    "session_id" in msg &&
    typeof (msg as { session_id?: unknown }).session_id === "string"
  );
}
