import type {
  CanUseTool,
  PermissionResult,
} from "@anthropic-ai/claude-agent-sdk";
import {
  WorkspaceGuard,
  type WorkspaceGuardOptions,
} from "../../session/tools/fs-guard";
import { currentTurnMode } from "../../session/turn-mode-context";
import { targetPaths } from "./tool-target-paths";

/**
 * The permission gate: auto-approve reads in the workspace or configured
 * read-only roots, and writes/commands only in the workspace. Reuses
 * `WorkspaceGuard` (the same wall pi's file tools use), so absolute, `~`, `..`,
 * `@`/`file://`, and symlink escapes are denied with a clear message. Bash is
 * approved unless its command names a path token that escapes (absolute, `~`,
 * or a `..` segment climbing out of cwd).
 */
/** The mutating/executing built-ins a LIVE flip to plan mode must stop. */
const PLAN_DENIED_TOOLS = new Set(["Edit", "Write", "Bash"]);

export function makeCanUseTool(
  workspaceDir: string,
  guardOptions?: WorkspaceGuardOptions,
): CanUseTool {
  const guard = new WorkspaceGuard(workspaceDir, guardOptions);
  return async (toolName, input, options): Promise<PermissionResult> => {
    // Live plan-mode gate for the mid-turn Mode-pill switch (Claude Code's
    // shift+tab): a session BUILT at execute/auto still exposes Edit/Write/Bash,
    // so when the user switches to Plan while the turn runs, deny them here at
    // permission time with the switch-to-planning instruction. A plan-BUILT
    // session never offers these tools, so this only fires on a mid-turn switch.
    if (currentTurnMode() === "plan" && PLAN_DENIED_TOOLS.has(toolName)) {
      return {
        behavior: "deny",
        message:
          "The user just switched this conversation to Plan mode, so you can no longer make changes or run commands. Stop acting now: summarize what you already did, then lay out the remaining work as a clear step-by-step plan in plain language for the user to approve, and end your turn.",
      };
    }
    try {
      const paths = targetPaths(toolName, input);
      // The SDK flags a Bash command that reaches outside the allowed dirs via
      // `blockedPath` — clamp it too, so an escape our own parsing missed is
      // still caught (Bash has no single path field of its own).
      if (options.blockedPath) paths.push(options.blockedPath);
      for (const p of paths) guard.clamp(p);
      return { behavior: "allow", updatedInput: input };
    } catch (err) {
      return {
        behavior: "deny",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  };
}
