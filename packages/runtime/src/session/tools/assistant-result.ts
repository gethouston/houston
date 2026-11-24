import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { ASSISTANT_UNAVAILABLE_HERE } from "@houston/domain/assistant-deployment";

export type AssistantErrorCode =
  | typeof ASSISTANT_UNAVAILABLE_HERE
  | "unknown_operation"
  | "unknown_param"
  | "missing_param"
  | "invalid_param"
  | "invalid_params"
  | "needs_confirmation"
  | "confirmation_declined"
  | "operation_not_supported"
  | "plan_mode"
  | "not_in_turn"
  | "protected_conversation"
  | "compute_busy"
  | "gateway_error"
  | "transport_error";

export interface AssistantError {
  code: AssistantErrorCode;
  message: string;
  status?: number;
}

export interface AssistantConfirmationRequest {
  summary: string;
  params: Record<string, unknown>;
  requestId: string;
}

export type AssistantOperationDetails =
  | { ok: true; operation: string }
  | {
      ok: false;
      operation: string;
      error: AssistantError;
      confirmation?: AssistantConfirmationRequest;
    };

export type AssistantOperationResult =
  AgentToolResult<AssistantOperationDetails>;

export function assistantErrorResult(
  operation: string,
  error: AssistantError,
): AssistantOperationResult {
  return {
    content: [{ type: "text", text: `ERROR ${error.code}: ${error.message}` }],
    details: { ok: false, operation, error },
  };
}

export function assistantNeedsConfirmationResult(
  operation: string,
  message: string,
  confirmation: AssistantConfirmationRequest,
): AssistantOperationResult {
  return {
    content: [{ type: "text", text: `ERROR needs_confirmation: ${message}` }],
    details: {
      ok: false,
      operation,
      error: { code: "needs_confirmation", message },
      confirmation,
    },
  };
}

export function assistantOkResult(
  operation: string,
  payload: unknown,
): AssistantOperationResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload ?? null) }],
    details: { ok: true, operation },
  };
}

export function assistantTextResult(
  operation: string,
  text: string,
): AssistantOperationResult {
  return {
    content: [{ type: "text", text }],
    details: { ok: true, operation },
  };
}

export function reportsNotDone(details: unknown): boolean {
  return (
    typeof details === "object" &&
    details !== null &&
    (details as { ok?: unknown }).ok === false
  );
}
