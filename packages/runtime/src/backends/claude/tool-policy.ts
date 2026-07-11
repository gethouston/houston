import { isAbsolute } from "node:path";
import type {
  CanUseTool,
  PermissionResult,
} from "@anthropic-ai/claude-agent-sdk";
import type { TurnMode } from "@houston/protocol";
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
 * Crucially the FILE tools carry NO `allowedTools` entry: an allow rule
 * pre-approves a tool and SHORT-CIRCUITS `canUseTool`, so listing Read/Edit/
 * Write/Glob/Grep there would let the model touch any path with the Gate #1
 * clamp never running. Instead every file-tool call routes through
 * `makeCanUseTool`, which auto-approves in-workspace targets (no human is there
 * to prompt) and denies escapes — reproducing Houston's auto-run plus the
 * workspace wall in one handler.
 *
 * The in-process MCP custom tools are the one deliberate exception: `backend.ts`
 * allow-lists their `mcp__houston__*` names (see `custom-tools.ts`), so they run
 * without a prompt and DO NOT route through `makeCanUseTool`. That is safe —
 * they hold no path for the workspace guard to clamp, and it matches pi auto-run.
 * The `{ tools, disallowedTools }` this file builds still governs only the SDK
 * BUILT-INS.
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

/**
 * The read-only file tools plan mode allows (SDK names). No Edit/Write; Bash
 * joins per `localBash` (see `buildToolPolicy`) so a plan turn can do the live
 * lookups planning needs (current time, curl/wget) — the same subset pi's
 * PLAN_MODE_TOOL_NAMES grants, kept in lockstep.
 */
const PLAN_FILE_TOOLS = ["Read", "Glob", "Grep"] as const;

export interface ToolPolicyInput {
  /** True when code execution is local — the only mode that grants Bash. */
  localBash: boolean;
  /**
   * The turn's execution mode. "plan" clamps the SDK built-ins to the read-only
   * subset (Read/Glob/Grep, plus Bash per `localBash`) and denies Edit/Write —
   * bash stays for live lookups; its no-mutation rule is the plan overlay's
   * mandate, matching pi's plan selection. "auto" (Autopilot) keeps
   * the SAME built-in policy as execute (file tools + Bash per `localBash`) — the
   * Claude-native built-ins have no blocking `ask_user`, so auto's "never wait on
   * the user" rule is enforced only on the MCP side (custom-tools drops ask_user
   * and request_connection); nothing to clamp here. Absent or "execute" is the
   * full policy gated only by `localBash`.
   */
  mode?: TurnMode;
}

export interface ToolPolicy {
  tools: string[];
  disallowedTools: string[];
}

/** Build the `{ tools, disallowedTools }` SDK options (this object sets no `allowedTools` — see above). */
export function buildToolPolicy(input: ToolPolicyInput): ToolPolicy {
  // Plan mode: read-only built-ins plus Bash (per localBash) for live lookups,
  // and deny every write tool. We do NOT switch the SDK to permissionMode
  // "plan" — that forces the ExitPlanMode tool (which pi lacks) and the SDK's
  // own plan prompt; Houston keeps permissionMode "default" and enforces plan
  // via this allowlist + the overlay.
  if (input.mode === "plan") {
    return {
      tools: input.localBash
        ? [...PLAN_FILE_TOOLS, "Bash"]
        : [...PLAN_FILE_TOOLS],
      disallowedTools: input.localBash
        ? [...PI_LACKS, "Edit", "Write"]
        : [...PI_LACKS, "Edit", "Write", "Bash"],
    };
  }
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
