import type { TurnMode } from "@houston/protocol";
import { ASK_USER_TOOL_NAME } from "./tools/ask-user";
import { CLAMPED_FILE_TOOL_NAMES } from "./tools/clamped-fs";
import {
  INTEGRATION_TOOL_NAMES,
  PROPOSE_CUSTOM_INTEGRATION_TOOL_NAME,
  PROPOSE_MCP_SERVER_TOOL_NAME,
  REQUEST_CONNECTION_TOOL_NAME,
} from "./tools/integrations";

export type CodeExecutionMode = "local" | "remote" | "disabled";

export interface ToolSelectionInput {
  codeExecution: CodeExecutionMode;
  integrations: boolean;
}

export interface ToolSelection {
  toolNames: string[];
  includeRunCode: boolean;
}

/**
 * pi requires a name allowlist for both built-in and custom tools. Keep that
 * decision pure so managed pods can prove code execution is disabled without
 * spinning up a live model session.
 */
/**
 * The read-only tool subset a "plan" turn is clamped to: the clamped-fs READ
 * tools (`read, ls, grep, find` — never `edit`/`write`) plus `ask_user` (holds
 * no credential, takes no real-world action). Everything that mutates or acts is
 * dropped: `edit, write, bash, run_code`, and ALL integration tools
 * (`integration_search`, `integration_execute`, `request_connection` — an
 * integration call is a real-world action against the user's connected apps).
 */
export const PLAN_MODE_TOOL_NAMES: readonly string[] = [
  "read",
  "ls",
  "grep",
  "find",
  ASK_USER_TOOL_NAME,
];

/**
 * Clamp an execute-mode tool allowlist to the plan-mode read-only subset: keep
 * only the names in {@link PLAN_MODE_TOOL_NAMES}, preserving their order. Applied
 * to whatever `buildToolSelection` produced, so plan mode composes with every
 * code-execution / integration selection (a `bash`/`run_code`/`integration_*`
 * name is simply filtered out).
 */
export function planToolNames(all: readonly string[]): string[] {
  return all.filter((name) => PLAN_MODE_TOOL_NAMES.includes(name));
}

/**
 * The blocking/interactive tools Autopilot ("auto") mode drops: `ask_user`
 * (holds the turn open on a question), `request_connection` (holds it open on a
 * connect card), and the two proposal hand-offs `propose_custom_integration` /
 * `propose_mcp_server` (each holds it open on a secure setup card the user fills
 * in). Auto never waits on the user, so all are removed. EVERYTHING else an
 * execute turn had — the clamped-fs read AND write tools, `bash` / `run_code`,
 * and the acting integration tools (`integration_search`, `integration_execute`)
 * — stays: auto acts, it just never blocks.
 */
export const AUTO_MODE_EXCLUDED_TOOL_NAMES: readonly string[] = [
  ASK_USER_TOOL_NAME,
  REQUEST_CONNECTION_TOOL_NAME,
  PROPOSE_CUSTOM_INTEGRATION_TOOL_NAME,
  PROPOSE_MCP_SERVER_TOOL_NAME,
];

/**
 * Clamp an execute-mode tool allowlist to the Autopilot subset: drop exactly the
 * blocking tools in {@link AUTO_MODE_EXCLUDED_TOOL_NAMES}, keep everything else
 * in its original order. The inverse of plan (which keeps only read-only tools) —
 * auto keeps every acting tool and only removes the ways to wait on the user.
 */
export function autoToolNames(all: readonly string[]): string[] {
  return all.filter((name) => !AUTO_MODE_EXCLUDED_TOOL_NAMES.includes(name));
}

/**
 * The one place a turn's mode picks its tool allowlist: "plan" clamps to the
 * read-only subset, "auto" drops the blocking tools, and "execute" (or an absent
 * mode) passes the full allowlist through unchanged. Both backends dispatch
 * through here so the pi and Claude paths never drift on what a mode allows.
 */
export function toolNamesForMode(
  mode: TurnMode | undefined,
  all: readonly string[],
): string[] {
  switch (mode) {
    case "plan":
      return planToolNames(all);
    case "auto":
      return autoToolNames(all);
    default:
      return [...all];
  }
}

export function buildToolSelection(input: ToolSelectionInput): ToolSelection {
  const executable =
    input.codeExecution === "local"
      ? ["bash"]
      : input.codeExecution === "remote"
        ? ["run_code"]
        : [];
  return {
    toolNames: [
      ...CLAMPED_FILE_TOOL_NAMES,
      // ask_user is available in EVERY mode/backend — any blocking question,
      // choice, or approval goes through it instead of plain-text.
      ASK_USER_TOOL_NAME,
      ...executable,
      ...(input.integrations ? INTEGRATION_TOOL_NAMES : []),
    ],
    includeRunCode: input.codeExecution === "remote",
  };
}
