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
      ...executable,
      ...(input.integrations ? INTEGRATION_TOOL_NAMES : []),
    ],
    includeRunCode: input.codeExecution === "remote",
  };
}
