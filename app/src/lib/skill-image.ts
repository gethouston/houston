/**
 * Resolve a skill's `image` frontmatter value to a renderable URL.
 *
 * A skill image is either a full `https://` URL or a Microsoft Fluent 3D Emoji
 * slug (e.g. `rocket`, `magnifying-glass-tilted-left`, folder name lowercased
 * with spaces turned to dashes). Bare slugs resolve to the jsDelivr CDN.
 *
 * Returns `null` when there is no usable image, so callers can decide their own
 * fallback (a monogram box for the installed-skill rows, the `sparkles` emoji
 * for the round skill-card avatar).
 */
export function resolveSkillImageUrl(
  image: string | null | undefined,
): string | null {
  const trimmed = image?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return fluentEmojiUrl(trimmed);
}

/** Build the jsDelivr CDN URL for a Fluent 3D Emoji slug. */
export function fluentEmojiUrl(slug: string): string {
  const parts = slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((p) => p.toLowerCase());
  const folder =
    parts[0].charAt(0).toUpperCase() +
    parts[0].slice(1) +
    (parts.length > 1 ? ` ${parts.slice(1).join(" ")}` : "");
  const file = `${parts.join("_")}_3d.png`;
  return `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/${encodeURIComponent(folder)}/3D/${file}`;
}
