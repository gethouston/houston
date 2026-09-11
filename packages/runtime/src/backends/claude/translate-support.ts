import type { TokenUsage, WireEvent } from "@houston/runtime-client";

/**
 * Normalize the Claude Agent SDK's token usage into Houston's `TokenUsage`,
 * BYTE-MATCHING the pi normalization (`backends/pi/wire.ts`): the prompt filling
 * the window is everything but output, so `context_tokens = total - output` where
 * `total = input + output + cache_read + cache_creation`, and `cached_tokens` is
 * the cache-read portion. Reads the SDK's snake_case `BetaUsage` fields; a missing
 * field counts as 0. Returns null when there is no input signal at all (no
 * misleading zero usage), and clamps a degenerate output > total to keep context
 * non-negative.
 */
export function normalizeUsage(u: unknown): TokenUsage | null {
  const usage = u as
    | {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number | null;
        cache_creation_input_tokens?: number | null;
      }
    | null
    | undefined;
  if (!usage || typeof usage.input_tokens !== "number") return null;
  const input = usage.input_tokens;
  const output = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreation = usage.cache_creation_input_tokens ?? 0;
  const total = input + output + cacheRead + cacheCreation;
  return {
    context_tokens: Math.max(0, total - output),
    output_tokens: output,
    cached_tokens: cacheRead,
  };
}

export interface ToolBlock {
  id: string;
  name: string;
  /** Accumulated `input_json_delta` fragments; parsed at content_block_stop. */
  json: string;
  /** The start block's `input`, used when no json deltas arrived. */
  input: unknown;
}

/**
 * The Claude Agent SDK's stand-in for tool input the model streamed as invalid
 * JSON. The CLI never runs such a call: it hands the model an
 * `InputValidationError` tool_result and lets it retry, and its `assistant`
 * message carries this marker in place of the arguments (verified against
 * claude-agent-sdk 0.3.257 with a fake API — PRODUCT-1694).
 */
export interface UnparsedToolInputMarker {
  __unparsedToolInput: { raw?: string; len?: number };
}

export function isUnparsedToolInput(
  input: unknown,
): input is UnparsedToolInputMarker {
  if (typeof input !== "object" || input === null) return false;
  if (!("__unparsedToolInput" in input)) return false;
  const marker = (input as UnparsedToolInputMarker).__unparsedToolInput;
  return typeof marker === "object" && marker !== null;
}

export type DeltaParse =
  | { ok: true; args: unknown }
  | { ok: false; reason: string };

/** Parse a tool call's accumulated `input_json_delta` fragments. */
export function parseDeltaJson(tb: ToolBlock): DeltaParse {
  if (!tb.json) return { ok: true, args: tb.input ?? {} };
  try {
    return { ok: true, args: JSON.parse(tb.json) };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * The tool_start frame for a completed call, from the SDK's own parse of its
 * input. The unparsed marker means the CLI skipped the call and asked the model
 * to retry — an expected model glitch, logged as a breadcrumb (console.warn is
 * never a Sentry event) with the parse reason, and rendered as empty args.
 */
export function toolStartFrame(tb: ToolBlock, sdkInput: unknown): WireEvent {
  let args = sdkInput;
  if (isUnparsedToolInput(sdkInput)) {
    const parsed = parseDeltaJson(tb);
    const reason = parsed.ok ? "rejected by the SDK" : parsed.reason;
    const len = sdkInput.__unparsedToolInput.len ?? tb.json.length;
    console.warn(
      `[claude] tool "${tb.name}" input was not valid JSON (${len} bytes); the SDK skipped the call and asked the model to retry: ${reason}`,
    );
    args = {};
  }
  return { type: "tool_start", data: { name: tb.name, args } };
}

/**
 * A call whose deltas failed to parse and for which the SDK never delivered its
 * `assistant` block: an unexpected shape, so it IS a reported error.
 */
export function unverifiedToolStart(tb: ToolBlock): WireEvent {
  const parsed = parseDeltaJson(tb);
  console.error(
    `[claude] failed to parse tool "${tb.name}" input JSON and the SDK delivered no assistant block for it: ${
      parsed.ok ? "parsed late" : parsed.reason
    } :: ${tb.json.slice(0, 500)}`,
  );
  return { type: "tool_start", data: { name: tb.name, args: {} } };
}

/** A `tool_use` block off an SDK `assistant` message (external `BetaContentBlock`). */
export interface AssistantContentBlock {
  type?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

/**
 * Minimal structural view of the SDK's `BetaRawMessageStreamEvent` — a deep,
 * version-coupled external union. We read only the fields below and narrow
 * defensively by the `type` discriminant.
 */
export interface EventLike {
  type?: string;
  index?: number;
  content_block?: {
    type?: string;
    id?: string;
    name?: string;
    input?: unknown;
  };
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
  };
}

/** A `tool_result` block off a user message (external `BetaContentBlockParam`). */
export interface UserContentBlock {
  type?: string;
  tool_use_id?: string;
  is_error?: boolean;
  /** Result payload: a plain string or text/image blocks. */
  content?: string | { type?: string; text?: string }[];
}

/**
 * The text a `tool_result` block returned to the model — a plain string, or
 * its `text` blocks joined. Image blocks have no text and are skipped.
 */
export function toolResultText(content: UserContentBlock["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");
}
