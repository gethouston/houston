export function hiddenPromptDisplayText(
  text: string,
  hasHiddenPrompt: boolean,
): string | undefined {
  return hasHiddenPrompt && text.length > 0 ? text : undefined;
}
