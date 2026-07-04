import type {
  CanUseTool,
  PermissionResult,
} from "@anthropic-ai/claude-agent-sdk";
import { WorkspaceGuard } from "../../session/tools/fs-guard";

/**
 * The Claude Agent SDK tool policy for a Houston session. pi exposes only a
 * clamped file toolset (Read/Edit/Write/Glob/Grep) plus Bash when code execution
 * is local; the Claude backend must match that exactly. Two layers do it:
 *
 * 1. `tools` — the base availability allowlist. This is the SDK's own mechanism
 *    for restricting which built-ins the model can see, so everything else is
 *    removed from its context entirely.
 * 2. `disallowedTools` — an explicit deny of the Claude Code tools pi lacks
 *    (WebSearch/WebFetch/Task/…). Redundant with (1) today, but defense-in-depth
 *    against a future preset re-introducing one, and it also drops Bash when code
 *    execution is off.
 *
 * Crucially there is NO `allowedTools`: an allow rule pre-approves a tool and
 * SHORT-CIRCUITS `canUseTool`, so listing the file tools there would let the
 * model touch any path with the Gate #1 clamp never running. Instead every call
 * routes through `makeCanUseTool`, which auto-approves in-workspace targets (no
 * human is there to prompt) and denies escapes — reproducing Houston's auto-run
 * plus the workspace wall in one handler.
 */

/** The clamped file tools pi always exposes (SDK names). */
const FILE_TOOLS = ["Read", "Edit", "Write", "Glob", "Grep"] as const;

/**
 * Default Claude Code tools pi has no equivalent for. Listed in `disallowedTools`
 * so they are stripped from the model's context even if a preset would offer them.
 */
const PI_LACKS = [
  "Task",
  "TodoWrite",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
  "ExitPlanMode",
  "AskUserQuestion",
  "BashOutput",
  "KillShell",
  "Skill",
  "SlashCommand",
] as const;

export interface ToolPolicyInput {
  /** True when code execution is local — the only mode that grants Bash. */
  localBash: boolean;
}

export interface ToolPolicy {
  tools: string[];
  disallowedTools: string[];
}

/** Build the `{ tools, disallowedTools }` SDK options (no `allowedTools` — see above). */
export function buildToolPolicy(input: ToolPolicyInput): ToolPolicy {
  const tools = input.localBash ? [...FILE_TOOLS, "Bash"] : [...FILE_TOOLS];
  // Deny Bash outright when code execution is off, on top of omitting it above.
  const disallowedTools = input.localBash
    ? [...PI_LACKS]
    : [...PI_LACKS, "Bash"];
  return { tools, disallowedTools };
}

/**
 * The permission gate: auto-approve a tool call whose target paths resolve inside
 * the workspace, deny any that escape. Reuses `WorkspaceGuard.clamp` (the same
 * wall pi's file tools use), so a Read/Edit/Write/Glob/Grep path outside the root
 * — absolute, `~`, `..`, `@`/`file://`, or a symlink leaving the root — is denied
 * with a clear message. Bash is approved unless its command names an
 * absolute/home path that escapes (conservative: relative paths stay cwd-bound).
 */
export function makeCanUseTool(workspaceDir: string): CanUseTool {
  const guard = new WorkspaceGuard(workspaceDir);
  return async (toolName, input, options): Promise<PermissionResult> => {
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

/** The path(s) a tool call would touch, for clamping. */
function targetPaths(
  toolName: string,
  input: Record<string, unknown>,
): string[] {
  switch (toolName) {
    case "Read":
    case "Edit":
    case "Write": {
      const fp = input.file_path;
      return typeof fp === "string" ? [fp] : [];
    }
    case "Glob":
    case "Grep": {
      const p = input.path;
      return typeof p === "string" ? [p] : [];
    }
    case "Bash": {
      const cmd = input.command;
      return typeof cmd === "string" ? bashEscapeCandidates(cmd) : [];
    }
    default:
      return [];
  }
}

/**
 * Absolute / home-relative path tokens in a Bash command — the only escape risk
 * (relative tokens resolve under the workspace cwd). Each is clamped; an escape
 * denies the whole command. Conservative by design: over-denying an odd absolute
 * path is safer than letting `cat /etc/passwd` through.
 */
function bashEscapeCandidates(command: string): string[] {
  return command
    .split(/[\s;|&()<>"'`]+/)
    .filter((t) => t.startsWith("/") || t.startsWith("~"));
}
