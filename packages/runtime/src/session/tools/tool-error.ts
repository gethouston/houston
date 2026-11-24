import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import {
  type AgentDelegationRefusalCode,
  isAgentDelegationRefusalCode,
} from "@houston/protocol";
import {
  COMPUTE_BUSY_TOOL_MESSAGE,
  POD_WAKE_REFUSED_TOOL_MESSAGE,
} from "./compute-busy-retry";

export type SessionToolErrorCode =
  | "agent_required"
  | "mission_not_found"
  | "empty_query"
  | "not_in_turn"
  | "plan_mode"
  | "host_error"
  | "transport_error"
  | "mission_cap"
  | "mission_depth"
  | "mission_fanout"
  | "agent_not_found"
  | "agent_ambiguous"
  | "invalid_provider"
  | "invalid_model"
  | "agent_unreachable"
  | "agent_refused"
  | "compute_busy"
  | "operation_unavailable_here"
  | AgentDelegationRefusalCode;

export interface SessionToolError {
  code: SessionToolErrorCode;
  message: string;
  status?: number;
}

export interface SessionToolErrorDetails {
  ok: false;
  error: SessionToolError;
}

export function toolErrorResult(
  error: SessionToolError,
): AgentToolResult<SessionToolErrorDetails> {
  return {
    content: [
      { type: "text" as const, text: `ERROR ${error.code}: ${error.message}` },
    ],
    details: { ok: false, error },
  };
}

export async function hostErrorFrom(
  res: Response,
  what: string,
): Promise<SessionToolError> {
  let detail = "";
  try {
    detail = await res.text();
  } catch (err) {
    console.error("[mission tools] could not read host refusal", err);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(detail);
  } catch (err) {
    console.error("[mission tools] host refusal was not JSON", err);
    payload = null;
  }
  if (typeof payload === "object" && payload !== null) {
    const { code, error } = payload as { code?: unknown; error?: unknown };
    if (code === "compute_busy")
      return {
        code: "compute_busy",
        message: COMPUTE_BUSY_TOOL_MESSAGE,
        status: res.status,
      };
    if (code === "pod_wake_refused")
      return {
        code: "operation_unavailable_here",
        message: POD_WAKE_REFUSED_TOOL_MESSAGE,
        status: res.status,
      };
    if (isActionableCode(code) && typeof error === "string")
      return { code, message: error, status: res.status };
  }
  return {
    code: "host_error",
    status: res.status,
    message: `${what} was refused (HTTP ${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}.`,
  };
}

function isActionableCode(code: unknown): code is SessionToolErrorCode {
  return (
    code === "not_in_turn" ||
    code === "plan_mode" ||
    code === "mission_cap" ||
    code === "mission_depth" ||
    code === "mission_fanout" ||
    code === "mission_not_found" ||
    code === "agent_not_found" ||
    code === "agent_ambiguous" ||
    code === "invalid_provider" ||
    code === "agent_unreachable" ||
    code === "agent_refused" ||
    isAgentDelegationRefusalCode(code)
  );
}
