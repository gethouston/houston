import { ASK_USER_TOOL_NAME } from "./tools/ask-user";
import { CLAMPED_FILE_TOOL_NAMES } from "./tools/clamped-fs";
import { INTEGRATION_TOOL_NAMES } from "./tools/integrations";

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
