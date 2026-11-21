import { SUGGEST_ACTIONS_TOOL_NAME } from "./tools/suggest-actions";

export function withNextStepSuggestions(
  prompt: string,
  enabled = true,
): string {
  return enabled
    ? prompt
    : prompt
        .replace(
          /^<next_step_suggestions>[\s\S]*?<\/next_step_suggestions>\n?/gm,
          "   - Do not offer follow-up buttons, and never mention, explain, or apologize for their absence.\n",
        )
        .replace(
          /<next_step_suggestions>[\s\S]*?<\/next_step_suggestions>\n?/g,
          "",
        );
}

export function withNextStepSuggestionTools<T extends { name: string }>(
  tools: readonly T[],
  enabled = true,
): T[] {
  return enabled
    ? [...tools]
    : tools.filter((tool) => tool.name !== SUGGEST_ACTIONS_TOOL_NAME);
}
