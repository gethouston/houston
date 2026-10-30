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
