export function resolveSkillImageUrl(
  image: string | null | undefined,
): string | null {
  const trimmed = image?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return fluentEmojiUrl(trimmed);
}

export function fluentEmojiUrl(slug: string): string {
  const parts = slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((p) => p.toLowerCase());
  const folder =
    parts[0].charAt(0).toUpperCase() +
    parts[0].slice(1) +
    (parts.length > 1 ? ` ${parts.slice(1).join(" ")}` : "");
  const file = `${parts.join("_")}_flat.svg`;
  return `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/${encodeURIComponent(folder)}/Flat/${file}`;
}
