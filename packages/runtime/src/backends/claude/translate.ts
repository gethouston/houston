import type {
  SDKMessage,
  SDKRateLimitInfo,
} from "@anthropic-ai/claude-agent-sdk";
import type { WireEvent } from "@houston/runtime-client";
import { classifyText, mapSdkError } from "./errors";
import { isAssistantMessageStart } from "./sdk-message-shapes";
import { createContentBlockTracker } from "./translate-blocks";
import type { EventLike } from "./translate-support";
import { createUsageTracker } from "./translate-usage";
import { isRejectedWindow } from "./usage-limit";

export { normalizeUsage } from "./translate-support";

type AssistantMsg = Extract<SDKMessage, { type: "assistant" }>;
type ResultMsg = Extract<SDKMessage, { type: "result" }>;

export interface TranslatorCallbacks {
  onContextTokens(tokens: number): void;
  usedAccessDigest?: string;
}

export function createStreamTranslator(cb: TranslatorCallbacks) {
  const blocks = createContentBlockTracker();
  const usage = createUsageTracker((tokens) => {
    cb.onContextTokens(tokens);
  });
  let lastRateLimitRetry: number | null = null;
  let lastRateLimit: SDKRateLimitInfo | null = null;
  let emittedError = false;

  function translate(msg: SDKMessage): WireEvent[] {
    switch (msg.type) {
      case "stream_event":
        if (isAssistantMessageStart(msg)) blocks.onMessageStart();
        return blocks.onStreamEvent(msg.event as EventLike);
      case "user":
        return blocks.onUserMessage(msg.message?.content, msg.tool_use_result);
      case "assistant":
        return onAssistant(msg);
      case "result":
        return onResult(msg);
      case "rate_limit_event":
        lastRateLimit = msg.rate_limit_info ?? null;
        onRateLimit(lastRateLimit);
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
    if (!msg.error && msg.parent_tool_use_id === null) {
      usage.noteRequestUsage(msg.message?.usage);
    }
    const content = msg.message?.content;
    const started = blocks.onAssistantMessage(content);
    if (!msg.error || emittedError) return started;
    emittedError = true;
    const text = Array.isArray(content)
      ? content
          .filter((b) => b?.type === "text")
          .map((b) => ("text" in b && typeof b.text === "string" ? b.text : ""))
          .join("")
      : "";
    return [
      ...started,
      {
        type: "provider_error",
        data: mapSdkError(msg.error, {
          message: text || `Claude error: ${msg.error}`,
          model: msg.message?.model ?? null,
          retryAfterSeconds: lastRateLimitRetry,
          rateLimit: lastRateLimit,
          usedAccessDigest: cb.usedAccessDigest,
        }),
      },
    ];
  }

  function onResult(msg: ResultMsg): WireEvent[] {
    const out: WireEvent[] = blocks.onTurnEnd();
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

  function onRateLimit(info: SDKRateLimitInfo | null): void {
    lastRateLimitRetry = null;
    const resetsAt = info?.resetsAt;
    if (!isRejectedWindow(info) || typeof resetsAt !== "number") return;
    const resetMs = resetsAt < 1e12 ? resetsAt * 1000 : resetsAt;
    lastRateLimitRetry = Math.max(0, Math.ceil((resetMs - Date.now()) / 1000));
  }

  return { translate };
}
