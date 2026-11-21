import { houstonSystemPrompt } from "@houston/host/src/houston-prompt";
import { codeExecutionSentence } from "../session/resource-loader";
import type { CodeExecutionMode } from "../session/tool-selection-types";

export function turnSystemPrompt(
  codeExecution: CodeExecutionMode,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const product = houstonSystemPrompt({
    triggers: env.HOUSTON_MANAGED_CLOUD === "1",
  });
  return `${product}\n\n${codeExecutionSentence(codeExecution)}`;
}
