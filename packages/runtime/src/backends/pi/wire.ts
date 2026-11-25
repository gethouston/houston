import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import {
  clipToolResult,
  type TokenUsage,
  type WireEvent,
} from "@houston/runtime-client";
import { logProviderRetry } from "../../ai/provider-error-log";
import { reportsNotDone } from "../../session/tools/assistant-result";
import { startedMissionFromDetails } from "../../session/tools/start-mission-receipt";
import { classifyTurnFailure, type TurnHints } from "./turn-failure";

// WHY: Gemini via pi omits totalTokens; sum the parts. ADR-0010
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

export function createWireTranslator(): (
  e: AgentSessionEvent,
) => WireEvent | null {
  let sawText = false;
  let sawThinking = false;
  let sepText = false;
  let sepThinking = false;
  let heldError: Extract<WireEvent, { type: "provider_error" }> | null = null;
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
      const out = heldError;
      heldError = null;
      return out;
    }
    const wire = toWire(e, { retryErrorMessage });
    if (e.type === "auto_retry_start") retryErrorMessage = e.errorMessage;
    if (e.type === "turn_end") {
      retryErrorMessage = null;
      if (wire?.type === "provider_error") {
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
      const content = toolResultText(e.result);
      const details = (e.result as { details?: unknown } | null | undefined)
        ?.details;
      const mission =
        e.toolName === "start_mission" && !e.isError
          ? startedMissionFromDetails(details)
          : undefined;
      return {
        type: "tool_end",
        data: {
          name: e.toolName,
          isError: !!e.isError || reportsNotDone(details),
          ...(content ? { content: clipToolResult(content) } : {}),
          ...(mission ? { mission } : {}),
        },
      };
    }
    case "turn_end": {
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
