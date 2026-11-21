import { AGENT_COLOR_IDS } from "@houston/domain/agent-color-ids";
import type { AssistantOperation } from "./catalog";

const HEX = /^#[0-9a-f]{6}$/i;

const palette = AGENT_COLOR_IDS.join(", ");

function colorProblem(value: unknown): string | undefined {
  if (typeof value !== "string")
    return `must be one of the app's colours (${palette}), a #rrggbb value, or "" to clear it.`;
  if (value === "" || HEX.test(value)) return undefined;
  if ((AGENT_COLOR_IDS as readonly string[]).includes(value.toLowerCase()))
    return undefined;
  return `is not a known colour. Use one of ${palette}, a #rrggbb value, or "" to clear it.`;
}

export function valueProblem(
  op: AssistantOperation,
  params: Readonly<Record<string, unknown>>,
): string | undefined {
  for (const param of op.params) {
    const value = params[param.name];
    if (param.name !== "color" || value === undefined) continue;
    const problem = colorProblem(value);
    if (problem) return `"${param.name}" ${problem}`;
  }
  return undefined;
}
