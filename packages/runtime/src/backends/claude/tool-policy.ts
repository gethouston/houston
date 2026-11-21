import type { TurnMode } from "@houston/protocol";
import { CREDENTIAL_PERMISSION_RULES } from "./credential-rules";

export { makeCanUseTool } from "./tool-permission-gate";

const FILE_TOOLS = ["Read", "Edit", "Write", "Glob", "Grep"] as const;

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

const PLAN_FILE_TOOLS = ["Read", "Glob", "Grep"] as const;

const COORDINATOR_FILE_TOOLS = ["Read", "Write"] as const;
const COORDINATOR_DENIED = ["Edit", "Glob", "Grep", "Bash"] as const;

export interface ToolPolicyInput {
  localBash: boolean;
  personalAssistant?: boolean;
  mode?: TurnMode;
}

export interface ToolPolicy {
  tools: string[];
  disallowedTools: string[];
}

export function buildToolPolicy(input: ToolPolicyInput): ToolPolicy {
  const policy = builtInPolicy(input);
  return {
    tools: policy.tools,
    disallowedTools: [
      ...policy.disallowedTools,
      ...CREDENTIAL_PERMISSION_RULES,
    ],
  };
}

function builtInPolicy(input: ToolPolicyInput): ToolPolicy {
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
  const disallowedTools = input.localBash
    ? [...PI_LACKS]
    : [...PI_LACKS, "Bash"];
  return { tools, disallowedTools };
}
