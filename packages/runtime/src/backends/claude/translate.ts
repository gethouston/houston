import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { WireEvent } from "@houston/runtime-client";
import { classifyText, mapSdkError } from "./errors";
import { createContentBlockTracker } from "./translate-blocks";
import type { EventLike } from "./translate-support";
import { createUsageTracker } from "./translate-usage";

// Re-exported for tests that assert the pi-parity usage math directly.
export { normalizeUsage } from "./translate-support";

type AssistantMsg = Extract<SDKMessage, { type: "assistant" }>;
type ResultMsg = Extract<SDKMessage, { type: "result" }>;

/** Callbacks + per-session context a translator carries beside the stream. */
export interface TranslatorCallbacks {
  /** Latest observed context fill (from usage frames + compact boundaries). */
  onContextTokens(tokens: number): void;
  /**
   * Digest of the OAuth access token the SDK subprocess authenticates with —
   * threaded into every error classification so a revoked-token report names
   * the token this turn actually ran on (PRODUCT-1319).
   */
  usedAccessDigest?: string;
}

/**
 * A stateful translator: SDK stream/messages → `WireEvent`s, mirroring the pi
 * dialect (text / thinking / tool_start / tool_end / usage / provider_error;
 * never `done` — the orchestrator emits that). State is per-turn: content-block
 * kinds and tool-call input JSON accumulate across `stream_event` frames
 * (`includePartialMessages: true`), and a tool_use_id→name map lets a later
 * user-message `tool_result` resolve its tool_end. Unmapped messages drop to [].
 */
export function createStreamTranslator(cb: TranslatorCallbacks) {
  const blocks = createContentBlockTracker();
  const usage = createUsageTracker((tokens) => {
    cb.onContextTokens(tokens);
  });
  let lastRateLimitRetry: number | null = null;
  // At most one provider_error per turn: an errored assistant message and an
  // error result can both describe the same failure — never double-terminal.
  let emittedError = false;

  function translate(msg: SDKMessage): WireEvent[] {
    switch (msg.type) {
      case "stream_event":
        return blocks.onStreamEvent(msg.event as EventLike);
      case "user":
        return blocks.onUserMessage(msg.message?.content);
      case "assistant":
        return onAssistant(msg);
      case "result":
        return onResult(msg);
      case "rate_limit_event":
        onRateLimit(msg.rate_limit_info?.resetsAt);
        return [];
      case "system":
        if (msg.subtype === "compact_boundary") {
          const post = msg.compact_metadata?.post_tokens;
          if (typeof post === "number") usage.noteCompactBoundary(post);
        }
        return [];
      default:
        return [];
    }
  }

  function onAssistant(msg: AssistantMsg): WireEvent[] {
    // Per-request usage: each assistant message carries ITS API call's usage,
    // whose input + cache reads/writes = the context size of that request —
    // the live fill. Track the newest one so the turn's usage frame reports
    // the real window occupancy. Skipped for subagent messages (a subagent
    // fills its OWN context, not this conversation's) and for errored
    // responses (pi likewise only trusts clean assistant usage).
    if (!msg.error && msg.parent_tool_use_id === null) {
      usage.noteRequestUsage(msg.message?.usage);
    }
    if (!msg.error || emittedError) return [];
    emittedError = true;
    const content = msg.message?.content;
    const text = Array.isArray(content)
      ? content
          .filter((b) => b?.type === "text")
          .map((b) => ("text" in b && typeof b.text === "string" ? b.text : ""))
          .join("")
      : "";
    return [
      {
        type: "provider_error",
        data: mapSdkError(msg.error, {
          message: text || `Claude error: ${msg.error}`,
          model: msg.message?.model ?? null,
          retryAfterSeconds: lastRateLimitRetry,
          usedAccessDigest: cb.usedAccessDigest,
        }),
      },
    ];
  }

  function onResult(msg: ResultMsg): WireEvent[] {
    const out: WireEvent[] = [];
    const turnUsage = usage.turnUsage(msg.usage);
    if (turnUsage) out.push({ type: "usage", data: turnUsage });
    if (msg.subtype !== "success" && !emittedError) {
      emittedError = true;
      const errors: string[] = Array.isArray(msg.errors) ? msg.errors : [];
      const message = errors.join("; ") || `Claude turn error: ${msg.subtype}`;
      const status =
        "api_error_status" in msg && typeof msg.api_error_status === "number"
          ? msg.api_error_status
          : null;
      out.push({
        type: "provider_error",
        data: classifyText(message, null, status, cb.usedAccessDigest),
      });
    }
    return out;
  }

  function onRateLimit(resetsAt: unknown): void {
    if (typeof resetsAt !== "number") return;
    // resetsAt is an epoch; values below 1e12 are seconds, above are milliseconds.
    const resetMs = resetsAt < 1e12 ? resetsAt * 1000 : resetsAt;
    lastRateLimitRetry = Math.max(0, Math.ceil((resetMs - Date.now()) / 1000));
  }

  return { translate };
}
