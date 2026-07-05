import { isAbsolute } from "node:path";
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
 * with a clear message. Bash is approved unless its command names a path token
 * that escapes (absolute, `~`, or a `..` segment climbing out of cwd).
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
      const targets: string[] = [];
      if (typeof input.path === "string") targets.push(input.path);
      // Glob's real target is its PATTERN, not `path`: with no `path`, the
      // pattern is resolved against cwd, so an absolute/`~`/`..`-escaping
      // pattern (e.g. `Glob({pattern:"/etc/**/*.conf"})`) reads OUTSIDE the
      // workspace unless clamped. A benign relative glob (`**/*.ts`) has no
      // escape anchor, resolves under cwd, and is left to the default.
      if (typeof input.pattern === "string" && isEscapeToken(input.pattern))
        targets.push(input.pattern);
      return targets;
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
 * Path tokens in a Bash command that could escape the workspace: absolute (`/`),
 * home (`~`), or a `..` segment that climbs out of cwd — `cat ../../etc/passwd`
 * is relative AND escapes, so `..` must be caught here too. Each candidate is
 * clamped; any escape denies the whole command.
 *
 * This is NOT a security boundary. Arbitrary Bash is inherently porous —
 * redirections, `$HOME`, env expansion, and `$(...)` command substitution all
 * evade flat token inspection. This layer is defense-in-depth that must at least
 * not fail open on the trivial absolute/`~`/`..` cases. Conservative by design:
 * over-denying an odd path token is safer than leaking a read.
 */
function bashEscapeCandidates(command: string): string[] {
  return command.split(/[\s;|&()<>"'`]+/).filter(isEscapeToken);
}

/**
 * A path token or glob pattern that could resolve OUTSIDE the workspace and so
 * must be clamped: an absolute path (leading `/`, a Windows drive/UNC), a `~`
 * home reference, or any `..` segment that can climb out of cwd. Benign relative
 * inputs (a recursive `src` glob, `./sub`) return false and stay under cwd. For
 * glob patterns we deliberately do NOT parse magic — only the leading anchor
 * matters for escape detection.
 */
function isEscapeToken(token: string): boolean {
  if (isAbsolute(token) || token.startsWith("~")) return true;
  // Split on both separators so a `..` segment is caught on POSIX and Windows.
  return token.split(/[/\\]+/).includes("..");
}
