import { AGENT_COLOR_IDS } from "@houston/domain/agent-color-ids";
import type { AssistantOperation } from "./catalog";

/**
 * Values that are not identifiers but are still a closed set the model cannot
 * invent. A colour reaches the wire inside a team's body object, where the type
 * is honestly `string` - the surface accepts a palette id, a literal `#rrggbb`
 * a designer picked, or `""` to clear - so the schema cannot close it and the
 * check belongs here, next to entity resolution, refusing with the palette the
 * user would have recognised instead of writing "blurple" into their sidebar.
 */

const HEX = /^#[0-9a-f]{6}$/i;

const palette = AGENT_COLOR_IDS.join(", ");

/** Every colour a Houston surface stores: a palette id, a hex, or cleared. */
function colorProblem(value: unknown): string | undefined {
  if (typeof value !== "string")
    return `must be one of Houston's colours (${palette}), a #rrggbb value, or "" to clear it.`;
  if (value === "" || HEX.test(value)) return undefined;
  if ((AGENT_COLOR_IDS as readonly string[]).includes(value.toLowerCase()))
    return undefined;
  return `is not a colour Houston knows. Use one of ${palette}, a #rrggbb value, or "" to clear it.`;
}

/**
 * The first colour a call carries that Houston would not store, as the sentence
 * to refuse with. Colours travel both as a parameter of their own and as one
 * field of a body object (a team's name, mark and colour arrive together), so
 * both shapes are read.
 */
export function valueProblem(
  op: AssistantOperation,
  params: Readonly<Record<string, unknown>>,
): string | undefined {
  for (const param of op.params) {
    const value = params[param.name];
    if (value === undefined) continue;
    if (param.name === "color") {
      const problem = colorProblem(value);
      if (problem) return `"${param.name}" ${problem}`;
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const nested = (value as Record<string, unknown>).color;
    if (nested === undefined || nested === null) continue;
    const problem = colorProblem(nested);
    if (problem) return `"${param.name}.color" ${problem}`;
  }
  return undefined;
}
