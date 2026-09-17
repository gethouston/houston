import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import {
  clipToolResult,
  type TokenUsage,
  type WireEvent,
} from "@houston/runtime-client";
import { logProviderRetry } from "../../ai/provider-error-log";
import { classifyTurnFailure, type TurnHints } from "./turn-failure";

/**
 * Normalize pi's per-message `Usage` into our provider-agnostic `TokenUsage`.
 *
 * pi reports `totalTokens = input + output + cacheRead + cacheWrite` for BOTH
 * providers (Anthropic's four-way split is summed; OpenAI/Codex is rebalanced to
 * the same shape), so the prompt that occupies the context window is everything
 * but `output`: `context_tokens = totalTokens - output`. `cached_tokens` is the
 * cache-read portion. This mirrors the Rust engine's `ClaudeUsageRaw::normalize`.
 *
 * Some providers (notably Gemini through pi's OpenAI-completions path) deliver
 * the component fields WITHOUT a summed `totalTokens`. Rather than drop that turn
 * to null (an empty context bar that never triggers autocompact), synthesize the
 * window fill from the components: `context_tokens = input + cacheRead + cacheWrite`.
 * `output` alone says nothing about context size, so a usage with no
 * context-contributing field left stays null (no misleading zero).
 */
export function normalizeUsage(u: unknown): TokenUsage | null {
  const usage = u as
    | {
        totalTokens?: number;
        input?: number;
        output?: number;
        cacheRead?: number;
        cacheWrite?: number;
      }
    | null
    | undefined;
  if (!usage) return null;
  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const output = num(usage.output) ?? 0;
  const cacheRead = num(usage.cacheRead) ?? 0;
  const total = num(usage.totalTokens);
  if (total !== undefined) {
    return {
      context_tokens: Math.max(0, total - output),
      output_tokens: output,
      cached_tokens: cacheRead,
    };
  }
  // No totalTokens: fall back to the components. Require at least one
  // context-contributing field (input / cacheRead / cacheWrite); output-only or
  // an empty object carries no window signal and degrades to null.
  const input = num(usage.input);
  const cacheWrite = num(usage.cacheWrite);
  if (
    input === undefined &&
    cacheWrite === undefined &&
    num(usage.cacheRead) === undefined
  )
    return null;
  return {
    context_tokens: Math.max(0, (input ?? 0) + cacheRead + (cacheWrite ?? 0)),
    output_tokens: output,
    cached_tokens: cacheRead,
  };
}

/**
 * A stateful per-subscription translator over {@link toWire}: injects the
 * paragraph break between CONTENT BLOCKS that the flat delta stream otherwise
 * loses (HOU-857). A turn shaped text → tool call → text streams as two
 * distinct blocks (pi emits `text_start` for each), but every downstream
 * consumer — the live feed, the persisted transcript — concatenates the bare
 * deltas, gluing the second block onto the first mid-sentence ("…for you
 * now.Go ahead…"). When a new text block starts after this turn already
 * streamed text, the block's FIRST delta is prefixed with "\n\n"; same for
 * thinking blocks. The separator rides a delta (never emitted standalone), so
 * an empty block can't leave a dangling break. State resets on `agent_start`
 * so a long-lived subscriber never bleeds one turn's blocks into the next.
 *
 * It also gates provider errors on the PROMPT's outcome, not the request's
 * (HOU-1057). pi recovers from mid-prompt failures on its own — a
 * context-overflow rejection triggers compact-and-retry, a transient 429/529
 * auto-retries — all inside the same `prompt()` call, so an errored `turn_end`
 * is not yet a failed turn. Emitting it immediately painted a terminal "chat
 * got too long, switch model" card over a conversation pi then compacted and
 * answered normally. Instead the classified error is HELD: a later successful
 * assistant `turn_end` proves recovery and drops it; `agent_settled` — emitted
 * exactly once per prompt, after every retry/recovery path — flushes it if the
 * failure stood, so a real failure still surfaces (and still does so before
 * `prompt()` resolves, which exec-turn's settle path relies on). An `aborted`
 * turn_end is neutral: the user's Stop is its own terminal surface.
 */
export function createWireTranslator(): (
  e: AgentSessionEvent,
) => WireEvent | null {
  let sawText = false;
  let sawThinking = false;
  let sepText = false;
  let sepThinking = false;
  let heldError: Extract<WireEvent, { type: "provider_error" }> | null = null;
  // The failure text of pi's most recent auto-retry attempt in this prompt.
  // A terse Codex refusal on the final attempt borrows its reading from it
  // (ai/codex-terse-refusal.ts), so it must survive until the turn ends.
  let retryErrorMessage: string | null = null;
  return (e) => {
    if (e.type === "agent_start") {
      sawText = sawThinking = sepText = sepThinking = false;
      retryErrorMessage = null;
    } else if (e.type === "message_update") {
      const t = e.assistantMessageEvent.type;
      if (t === "text_start" && sawText) sepText = true;
      if (t === "thinking_start" && sawThinking) sepThinking = true;
    } else if (e.type === "agent_settled") {
      // The prompt is over — retries and overflow recovery included. If the
      // last word was still an error, it is now truly terminal: surface it.
      const out = heldError;
      heldError = null;
      return out;
    }
    const wire = toWire(e, { retryErrorMessage });
    if (e.type === "auto_retry_start") retryErrorMessage = e.errorMessage;
    if (e.type === "turn_end") {
      retryErrorMessage = null;
      if (wire?.type === "provider_error") {
        // Newest failure wins: a retry that fails again replaces the held
        // classification, so the flushed card names the final reason.
        heldError = wire;
        return null;
      }
      const msg = e.message;
      if (
        heldError &&
        msg?.role === "assistant" &&
        msg.stopReason !== "error" &&
        msg.stopReason !== "aborted"
      ) {
        // A clean assistant turn after the failure — pi's recovery worked.
        heldError = null;
      }
    }
    if (wire?.type === "text") {
      sawText = true;
      if (sepText) {
        sepText = false;
        return { ...wire, data: `\n\n${wire.data}` };
      }
    } else if (wire?.type === "thinking") {
      sawThinking = true;
      if (sepThinking) {
        sepThinking = false;
        return { ...wire, data: `\n\n${wire.data}` };
      }
    }
    return wire;
  };
}

/**
 * Map a pi AgentSession event to our wire event (or null to drop it). Shared
 * by the long-lived server (chat.ts) and the per-turn cloud runtime — the two
 * MUST emit identical frames, since the web client and the control-plane relay
 * speak this one dialect. Typed against pi's own `AgentSessionEvent` union so
 * the `switch` narrows each arm to the exact event shape. Subscriptions go
 * through {@link createWireTranslator}, which wraps this pure mapping with the
 * per-turn block-boundary state.
 */
export function toWire(
  e: AgentSessionEvent,
  hints: TurnHints = {},
): WireEvent | null {
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
    case "tool_execution_end": {
      // Carry the tool's output text (what the model saw), clipped here at
      // the source so every downstream carrier — feed, snapshot, history —
      // holds a bounded preview (HOU-717). Image blocks have no text and
      // are skipped; a text-less result omits the field.
      const content = toolResultText(e.result);
      return {
        type: "tool_end",
        data: {
          name: e.toolName,
          isError: !!e.isError,
          ...(content ? { content: clipToolResult(content) } : {}),
        },
      };
    }
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
      // Copilot look dead). NOTE: raw `toWire` returns the frame immediately, but
      // the stateful translator above holds it until `agent_settled` — pi may
      // still recover this prompt (overflow compact-and-retry, transient
      // auto-retry), and only an unrecovered failure reaches the chat (HOU-1057).
      // "aborted" is the user's own Stop (already surfaced
      // verbatim by cancelTurn as "Stopped by user"), so it falls through here to
      // the usage path, never double-reported.
      const msg = e.message;
      if (
        msg &&
        msg.role === "assistant" &&
        msg.stopReason === "error" &&
        msg.errorMessage
      ) {
        return {
          type: "provider_error",
          data: classifyTurnFailure(msg, msg.errorMessage, hints),
        };
      }
      // Otherwise its usage carries the latest request's context size = the
      // current context fill. Only an assistant message carries `usage`; other
      // message kinds normalize to null.
      const usage = msg && "usage" in msg ? normalizeUsage(msg.usage) : null;
      return usage ? { type: "usage", data: usage } : null;
    }
    case "auto_retry_start":
    case "auto_retry_end":
      logProviderRetry(e);
      return null;
    default:
      return null;
  }
}

/**
 * The text a pi tool result returned to the model — its `content` text blocks
 * joined. Best-effort against `result: any`: anything not shaped like pi's
 * `AgentToolResult` reads as "no text" rather than throwing mid-stream.
 */
function toolResultText(result: unknown): string {
  const content = (result as { content?: unknown } | null | undefined)?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (b): b is { type: "text"; text: string } =>
        b !== null &&
        typeof b === "object" &&
        (b as { type?: unknown }).type === "text" &&
        typeof (b as { text?: unknown }).text === "string",
    )
    .map((b) => b.text)
    .join("\n");
}
