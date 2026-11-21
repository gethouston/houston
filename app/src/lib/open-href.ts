export function looksLikeUrl(value: string): boolean {
  if (value.startsWith("//")) return true;
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+\-.]*):(.+)/.exec(value);
  if (!schemeMatch) return false;
  const rest = schemeMatch[2];
  if (rest.startsWith("\\")) return false;
  if (rest.startsWith("/") && schemeMatch[1].length === 1) return false;
  return true;
}
