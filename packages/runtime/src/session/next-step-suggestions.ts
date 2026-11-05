import { SUGGEST_ACTIONS_TOOL_NAME } from "./tools/suggest-actions";

/** Only the product-authored section is conditional; agent instructions stay intact. */
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
        // Inline tool references disappear without interrupting their sentence.
        .replace(
          /<next_step_suggestions>[\s\S]*?<\/next_step_suggestions>\n?/g,
          "",
        );
}

/**
 * A turn's tools with next-step suggestions on or off. Off drops only
 * `suggest_actions`; every other tool stays the same object, because pi's
 * lists hold tools already wrapped for logging and the deferred-file gate.
 */
export function withNextStepSuggestionTools<T extends { name: string }>(
  tools: readonly T[],
  enabled = true,
): T[] {
  return enabled
    ? [...tools]
    : tools.filter((tool) => tool.name !== SUGGEST_ACTIONS_TOOL_NAME);
}
