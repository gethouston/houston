import { actionWordsWithoutToolkit } from "@houston-ai/core/src/integration-action-words.ts";

export function humanizeIntegrationAction(
  toolkit: string,
  action: string | null,
): string | null {
  const words = (action ?? "")
    .split("_")
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
  if (words.length === 0) return null;
  const stripped = actionWordsWithoutToolkit(action ?? "", toolkit);
  const spoken = stripped.length > 0 ? stripped : words;
  const sentence = spoken.map((word) => word.toLowerCase()).join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
