import type { TurnMode } from "@houston/protocol";

// The permission gate lives beside this policy; re-exported so callers keep one
// import site for "the Claude backend's tool rules".
export { makeCanUseTool } from "./tool-permission-gate";

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

/** The read-only file tools plan mode allows (SDK names). No Edit/Write. */
const PLAN_FILE_TOOLS = ["Read", "Glob", "Grep"] as const;

/**
 * The personal assistant's file tools (SDK names). It coordinates and never
 * produces work, so it keeps only the pair memory consolidation needs — read
 * the memory file, write the trimmed list back — mirroring the pi-side
 * COORDINATOR_TOOL_NAMES clamp. Everything else (Edit/Glob/Grep/Bash) is denied.
 */
const COORDINATOR_FILE_TOOLS = ["Read", "Write"] as const;
const COORDINATOR_DENIED = ["Edit", "Glob", "Grep", "Bash"] as const;

export interface ToolPolicyInput {
  /** True when code execution is local — the only mode that grants Bash. */
  localBash: boolean;
  /**
   * True when this runtime is the user's personal assistant — the coordinator.
   * Clamps the built-ins to Read + Write (memory consolidation) and denies the
   * rest, whatever the deployment's code-execution setting says.
   */
  personalAssistant?: boolean;
  /**
   * The turn's execution mode. "plan" clamps the SDK built-ins to the read-only
   * subset (Read/Glob/Grep) and denies Edit/Write/Bash. "auto" (Autopilot) keeps
   * the SAME built-in policy as execute (file tools + Bash per `localBash`) — the
   * Claude-native built-ins have no blocking `ask_user`, so auto's "never wait on
   * the user" rule is enforced only on the MCP side (custom-tools drops
   * ask_user); nothing to clamp here. Absent or "execute" is the
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
  // Plan mode: read-only built-ins only, and deny every write/exec tool. We do
  // NOT switch the SDK to permissionMode "plan" — that forces the ExitPlanMode
  // tool (which pi lacks) and the SDK's own plan prompt; Houston keeps
  // permissionMode "default" and enforces plan via this allowlist + the overlay.
  if (input.mode === "plan") {
    return {
      tools: input.personalAssistant ? ["Read"] : [...PLAN_FILE_TOOLS],
      disallowedTools: input.personalAssistant
        ? [...PI_LACKS, ...COORDINATOR_DENIED, "Write"]
        : [...PI_LACKS, "Edit", "Write", "Bash"],
    };
  }
  if (input.personalAssistant) {
    return {
      tools: [...COORDINATOR_FILE_TOOLS],
      disallowedTools: [...PI_LACKS, ...COORDINATOR_DENIED],
    };
  }
  const tools = input.localBash ? [...FILE_TOOLS, "Bash"] : [...FILE_TOOLS];
  // Deny Bash outright when code execution is off, on top of omitting it above.
  const disallowedTools = input.localBash
    ? [...PI_LACKS]
    : [...PI_LACKS, "Bash"];
  return { tools, disallowedTools };
}
