import type { TokenUsage, WireEvent } from "@houston/runtime-client";

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
  json: string;
  input: unknown;
}

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

export function unverifiedToolStart(tb: ToolBlock): WireEvent {
  const parsed = parseDeltaJson(tb);
  console.error(
    `[claude] failed to parse tool "${tb.name}" input JSON and the SDK delivered no assistant block for it: ${
      parsed.ok ? "parsed late" : parsed.reason
    } :: ${tb.json.slice(0, 500)}`,
  );
  return { type: "tool_start", data: { name: tb.name, args: {} } };
}

export function warnDroppedToolBlock(tb: ToolBlock): void {
  console.warn(
    `[claude] tool "${tb.name}" input stream ended before its stop (${tb.json.length} bytes); the CLI retried the request, dropping the partial call`,
  );
}

export interface AssistantContentBlock {
  type?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

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

export interface UserContentBlock {
  type?: string;
  tool_use_id?: string;
  is_error?: boolean;
  content?: string | { type?: string; text?: string }[];
}

export function toolResultText(content: UserContentBlock["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");
}
