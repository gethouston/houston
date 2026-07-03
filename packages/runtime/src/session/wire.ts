import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { TokenUsage, WireEvent } from "@houston/runtime-client";
import { classifyProviderError } from "../ai/provider-error";

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
      // token, a rate limit, a 4xx/5xx from the gateway) does NOT throw from
      // prompt() — pi catches it internally and delivers the turn here as an
      // assistant message with stopReason "error" and the real reason in
      // `errorMessage`. Classify that into a TYPED provider_error so the chat
      // renders the matching reconnect / rate-limit card; dropping it left the
      // turn a silent, empty success ("no response, no error" — the bug that made
      // Copilot look dead). "aborted" is the user's own Stop (already surfaced
      // verbatim by cancelTurn as "Stopped by user"), so it falls through here to
      // the usage path, never double-reported.
      const msg = e.message;
      if (
        msg &&
        msg.role === "assistant" &&
        msg.stopReason === "error" &&
        msg.errorMessage
      ) {
        // Log the provider's VERBATIM failure text before it's reduced to a typed
        // card. The classifier collapses it into "unauthenticated" / "rate_limited"
        // / etc., but the raw reason (an opencode.ai 401 body, an entitlement 403,
        // a misclassified non-auth error) is otherwise never recorded — leaving
        // production provider failures undiagnosable from the engine logs.
        console.error(
          `[provider_error] provider=${msg.provider} model=${
            msg.model ?? "?"
          } status=${diagnosticStatus(msg.diagnostics) ?? "?"} :: ${
            msg.errorMessage
          }`,
        );
        return {
          type: "provider_error",
          data: classifyProviderError({
            provider: msg.provider,
            model: msg.model ?? null,
            message: msg.errorMessage,
            status: diagnosticStatus(msg.diagnostics),
          }),
        };
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

/**
 * Read an HTTP status off pi's structured diagnostics when it attached one
 * (`error.code` or `details.status`). pi often only sets a string `errorMessage`
 * with no diagnostic, so this is a best-effort hint; the classifier still parses
 * the message text when this returns null.
 */
function diagnosticStatus(
  diagnostics: AssistantMessage["diagnostics"],
): number | null {
  if (!diagnostics) return null;
  for (const d of diagnostics) {
    const code = d.error?.code;
    if (typeof code === "number" && code >= 100 && code <= 599) return code;
    if (typeof code === "string") {
      const n = Number(code);
      if (Number.isFinite(n) && n >= 100 && n <= 599) return n;
    }
    const status = d.details?.status ?? d.details?.httpStatus;
    if (typeof status === "number" && status >= 100 && status <= 599) {
      return status;
    }
  }
  return null;
}
