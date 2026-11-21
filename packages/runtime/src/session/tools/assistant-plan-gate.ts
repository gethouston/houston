import { currentTurnMode } from "../turn-mode-context";
import {
  type AssistantOperationResult,
  assistantErrorResult,
} from "./assistant-result";

export function refusedInPlanMode(
  method: string,
  name: string,
): AssistantOperationResult | undefined {
  if (method === "GET" || currentTurnMode() !== "plan") return undefined;
  return assistantErrorResult(name, {
    code: "operation_not_supported",
    message: `The user just switched this conversation to Plan mode, so you can no longer change anything in Houston. ${name} was NOT performed. Stop acting now: summarize what you already did, then lay out the remaining work as a clear step-by-step plan in plain language for the user to approve, and end your turn.`,
  });
}
