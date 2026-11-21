function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function actionWordsWithoutToolkit(
  action: string,
  toolkit: string,
): string[] {
  const words = action
    .split("_")
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
  const slug = normalize(toolkit);
  if (slug.length === 0) return words;
  let consumed = "";
  for (const [index, word] of words.entries()) {
    consumed += normalize(word);
    if (consumed === slug) return words.slice(index + 1);
    if (!slug.startsWith(consumed)) return words;
  }
  return words;
}
