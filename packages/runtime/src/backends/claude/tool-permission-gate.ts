import type {
  CanUseTool,
  PermissionResult,
} from "@anthropic-ai/claude-agent-sdk";
import {
  WorkspaceGuard,
  type WorkspaceGuardOptions,
} from "../../session/tools/fs-guard";
import { currentTurnMode } from "../../session/turn-mode-context";
import {
  isFileCall,
  isReadOnlyTool,
  judgeFileCall,
} from "./file-call-judgment";
import { bashEscapeCandidates } from "./tool-target-paths";

const PLAN_DENIED_TOOLS = new Set(["Edit", "Write", "Bash"]);

export function makeCanUseTool(
  workspaceDir: string,
  guardOptions?: WorkspaceGuardOptions,
): CanUseTool {
  const guard = new WorkspaceGuard(workspaceDir, guardOptions);
  return async (toolName, input, options): Promise<PermissionResult> => {
    if (currentTurnMode() === "plan" && PLAN_DENIED_TOOLS.has(toolName)) {
      return {
        behavior: "deny",
        message:
          "The user just switched this conversation to Plan mode, so you can no longer make changes or run commands. Stop acting now: summarize what you already did, then lay out the remaining work as a clear step-by-step plan in plain language for the user to approve, and end your turn.",
      };
    }
    const writes = toolName !== "Bash" && !isReadOnlyTool(toolName);
    try {
      if (options.blockedPath) {
        if (writes) guard.clampWrite(options.blockedPath);
        else guard.clamp(options.blockedPath);
      }
      if (isFileCall(toolName)) {
        const verdict = judgeFileCall(guard, toolName, input);
        if (verdict.behavior === "deny") return verdict;
        return {
          behavior: "allow",
          updatedInput: verdict.updatedInput ?? input,
        };
      }
      if (toolName === "Bash" && typeof input.command === "string")
        for (const p of bashEscapeCandidates(input.command)) guard.clamp(p);
      return { behavior: "allow", updatedInput: input };
    } catch (err) {
      return {
        behavior: "deny",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  };
}
