import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { TokenUsage, WireEvent } from "@houston/runtime-client";

/**
 * Normalize pi's per-message `Usage` into our provider-agnostic `TokenUsage`.
 *
 * pi reports `totalTokens = input + output + cacheRead + cacheWrite` for BOTH
 * providers (Anthropic's four-way split is summed; OpenAI/Codex is rebalanced to
 * the same shape), so the prompt that occupies the context window is everything
 * but `output`: `context_tokens = totalTokens - output`. `cached_tokens` is the
 * cache-read portion. This mirrors the Rust engine's `ClaudeUsageRaw::normalize`.
 */
export function normalizeUsage(u: unknown): TokenUsage | null {
  const usage = u as
    | { totalTokens?: number; output?: number; cacheRead?: number }
    | null
    | undefined;
  if (!usage || typeof usage.totalTokens !== "number") return null;
  const output = usage.output ?? 0;
  return {
    context_tokens: Math.max(0, usage.totalTokens - output),
    output_tokens: output,
    cached_tokens: usage.cacheRead ?? 0,
  };
}

/**
 * Map a pi AgentSession event to our wire event (or null to drop it). Shared
 * by the long-lived server (chat.ts) and the per-turn cloud runtime — the two
 * MUST emit identical frames, since the web client and the control-plane relay
 * speak this one dialect. Typed against pi's own `AgentSessionEvent` union so
 * the `switch` narrows each arm to the exact event shape.
 */
export function toWire(e: AgentSessionEvent): WireEvent | null {
  switch (e.type) {
    case "message_update": {
      const a = e.assistantMessageEvent;
      if (a.type === "text_delta") return { type: "text", data: a.delta ?? "" };
      if (a.type === "thinking_delta")
        return { type: "thinking", data: a.delta ?? "" };
      return null;
    }
    case "tool_execution_start":
      return { type: "tool_start", data: { name: e.toolName, args: e.args } };
    case "tool_execution_end":
      return {
        type: "tool_end",
        data: { name: e.toolName, isError: !!e.isError },
      };
    case "turn_end": {
      // Fired once per turn with the final assistant message.
      //
      // A model/provider failure pi could NOT complete (an expired or rejected
      // Copilot token, a rate limit, a 4xx from the gateway) does NOT throw from
      // prompt() — pi catches it internally and delivers the turn here as an
      // assistant message with stopReason "error" and the real reason in
      // `errorMessage`. Surface that as the turn's terminal `error` frame, or the
      // turn streams nothing and settles as a silent, empty success ("no
      // response, no error" — the bug that made Copilot look dead). "aborted" is
      // the user's own Stop, already surfaced verbatim by cancelTurn ("Stopped by
      // user"), so it is deliberately left to drop here, not double-reported.
      const msg = e.message;
      if (
        msg &&
        "stopReason" in msg &&
        msg.stopReason === "error" &&
        "errorMessage" in msg &&
        msg.errorMessage
      ) {
        return { type: "error", data: { message: msg.errorMessage } };
      }
      // Otherwise its usage carries the latest request's context size = the
      // current context fill. Only an assistant message carries `usage`; other
      // message kinds normalize to null.
      const usage = msg && "usage" in msg ? normalizeUsage(msg.usage) : null;
      return usage ? { type: "usage", data: usage } : null;
    }
    default:
      return null;
  }
}
