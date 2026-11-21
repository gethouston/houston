import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";
import {
  WorkspaceGuard,
  type WorkspaceGuardOptions,
} from "../../session/tools/fs-guard";
import { isFileCall, judgeFileCall } from "./file-call-judgment";

export function fileGuardHook(
  workspaceDir: string,
  options?: WorkspaceGuardOptions,
): HookCallback {
  const guard = new WorkspaceGuard(workspaceDir, options);
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const toolInput = input.tool_input;
    const verdict = isRecord(toolInput)
      ? judgeFileCall(guard, input.tool_name, toolInput)
      : isFileCall(input.tool_name)
        ? { behavior: "deny" as const, message: "The tool call had no input." }
        : { behavior: "allow" as const };
    if (verdict.behavior === "deny") return denyToolUse(verdict.message);
    if (!verdict.updatedInput) return {};
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        updatedInput: verdict.updatedInput,
      },
    };
  };
}

export const denyEveryTool: HookCallback = async () =>
  denyToolUse("Tools are unavailable for this request.");

export function denyToolUse(reason: string) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse" as const,
      permissionDecision: "deny" as const,
      permissionDecisionReason: reason,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
