import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { WireEvent } from "@houston/runtime-client";
import { classifyText, mapSdkError } from "./errors";
import {
  type EventLike,
  normalizeUsage,
  parseArgs,
  type ToolBlock,
  type UserContentBlock,
} from "./translate-support";

// Re-exported for tests that assert the pi-parity usage math directly.
export { normalizeUsage };

type AssistantMsg = Extract<SDKMessage, { type: "assistant" }>;
type ResultMsg = Extract<SDKMessage, { type: "result" }>;

/** Callbacks a translator fires for state that is not a wire frame. */
export interface TranslatorCallbacks {
  /** Latest observed context fill (from usage frames + compact boundaries). */
  onContextTokens(tokens: number): void;
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
  const toolBlocks = new Map<number, ToolBlock>();
  const toolNameById = new Map<string, string>();
  let lastRateLimitRetry: number | null = null;
  // At most one provider_error per turn: an errored assistant message and an
  // error result can both describe the same failure — never double-terminal.
  let emittedError = false;

  function translate(msg: SDKMessage): WireEvent[] {
    switch (msg.type) {
      case "stream_event":
        return onStreamEvent(msg.event as EventLike);
      case "user":
        return onUserMessage(msg.message?.content);
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
          if (typeof post === "number") cb.onContextTokens(post);
        }
        return [];
      default:
        return [];
    }
  }

  function onStreamEvent(event: EventLike): WireEvent[] {
    if (event?.type === "content_block_start" && event.index !== undefined) {
      const block = event.content_block;
      if (block?.type === "tool_use" && block.id && block.name) {
        toolBlocks.set(event.index, {
          id: block.id,
          name: block.name,
          json: "",
          input: block.input,
        });
        toolNameById.set(block.id, block.name);
      }
      return [];
    }
    if (event?.type === "content_block_delta") {
      const d = event.delta;
      if (d?.type === "text_delta" && d.text !== undefined)
        return [{ type: "text", data: d.text }];
      if (d?.type === "thinking_delta" && d.thinking !== undefined)
        return [{ type: "thinking", data: d.thinking }];
      if (d?.type === "input_json_delta" && event.index !== undefined) {
        const tb = toolBlocks.get(event.index);
        if (tb) tb.json += d.partial_json ?? "";
      }
      return [];
    }
    if (event?.type === "content_block_stop" && event.index !== undefined) {
      const tb = toolBlocks.get(event.index);
      if (!tb) return [];
      toolBlocks.delete(event.index);
      return [
        { type: "tool_start", data: { name: tb.name, args: parseArgs(tb) } },
      ];
    }
    return [];
  }

  function onUserMessage(content: unknown): WireEvent[] {
    if (!Array.isArray(content)) return [];
    const out: WireEvent[] = [];
    for (const block of content as UserContentBlock[]) {
      if (block?.type !== "tool_result") continue;
      // Only surface results for tools we started THIS turn; an unknown id is a
      // replayed/foreign result (e.g. resume history) and must not emit tool_end.
      const name = block.tool_use_id && toolNameById.get(block.tool_use_id);
      if (!name) continue;
      out.push({ type: "tool_end", data: { name, isError: !!block.is_error } });
    }
    return out;
  }

  function onAssistant(msg: AssistantMsg): WireEvent[] {
    if (!msg.error || emittedError) return [];
    emittedError = true;
    const content = msg.message?.content;
    const text = Array.isArray(content)
      ? content
          .filter(
            (b): b is { type: "text"; text: string } => b?.type === "text",
          )
          .map((b) => b.text)
          .join("")
      : "";
    return [
      {
        type: "provider_error",
        data: mapSdkError(msg.error, {
          message: text || `Claude error: ${msg.error}`,
          model: msg.message?.model ?? null,
          retryAfterSeconds: lastRateLimitRetry,
        }),
      },
    ];
  }

  function onResult(msg: ResultMsg): WireEvent[] {
    const out: WireEvent[] = [];
    const usage = normalizeUsage(msg.usage);
    if (usage) {
      out.push({ type: "usage", data: usage });
      cb.onContextTokens(usage.context_tokens);
    }
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
        data: classifyText(message, null, status),
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
