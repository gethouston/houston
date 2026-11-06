import { houstonSystemPrompt } from "@houston/host/src/houston-prompt";
import { codeExecutionSentence } from "../session/resource-loader";
import type { CodeExecutionMode } from "../session/tool-selection-types";

/**
 * The base prompt a pooled turn composes onto when no HOUSTON_SYSTEM_PROMPT
 * was configured: the Houston product prompt, the one a standing pod's host
 * stamps on the runtime it spawns (local/main.ts). A pool worker has no host
 * in front of it, so it builds the same prompt itself. Event wakes are offered
 * only where a trigger backend exists, which is managed cloud, as on the pod.
 *
 * The code-execution sentence comes last because the grant decides it per
 * turn: the product prompt assumes a shell, and a turn whose grant withheld
 * `code-run` must not be told it can run commands.
 */
export function turnSystemPrompt(
  codeExecution: CodeExecutionMode,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const product = houstonSystemPrompt({
    triggers: env.HOUSTON_MANAGED_CLOUD === "1",
  });
  return `${product}\n\n${codeExecutionSentence(codeExecution)}`;
}
