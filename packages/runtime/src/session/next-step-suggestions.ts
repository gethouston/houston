import { SUGGEST_ACTIONS_TOOL_NAME } from "./tools/suggest-actions";
import {
  makeSuggestReusableTool,
  SUGGEST_REUSABLE_TOOL_NAME,
} from "./tools/suggest-reusable";

/** Only the product-authored section is conditional; agent instructions stay intact. */
export function withNextStepSuggestions(
  prompt: string,
  enabled = true,
): string {
  return enabled
    ? prompt
    : prompt.replace(
        /<next_step_suggestions>[\s\S]*?<\/next_step_suggestions>\n?/g,
        "",
      );
}

const suggestReusableAlone = makeSuggestReusableTool(false);

/**
 * A turn's tools with next-step suggestions on or off. Off drops
 * `suggest_actions` and swaps in the `suggest_reusable` whose texts never name
 * it, so nothing the model reads points at a tool it does not have.
 */
export function withNextStepSuggestionTools<T extends { name: string }>(
  tools: readonly T[],
  enabled = true,
): T[] {
  if (enabled) return [...tools];
  return tools.flatMap((tool) => {
    if (tool.name === SUGGEST_ACTIONS_TOOL_NAME) return [];
    // SAFETY: every tool list here holds pi tool definitions; the swap is the
    // same tool built without the suggest_actions pairing.
    if (tool.name === SUGGEST_REUSABLE_TOOL_NAME)
      return [suggestReusableAlone as unknown as T];
    return [tool];
  });
}
