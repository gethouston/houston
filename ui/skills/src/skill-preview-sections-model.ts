import type { CommunitySkillPreview } from "./types";

/**
 * The optional detail sections a loaded preview can populate. Each field is
 * empty (`null` / `[]`) exactly when its section must NOT render, so the modal
 * never shows an empty heading, a blank chip, or an expander over nothing.
 */
export interface SkillPreviewSections {
  category: string | null;
  tags: string[];
  /**
   * Raw frontmatter toolkit slugs, still in author casing: resolving a slug to
   * an app name/logo is a Composio-catalog concern that belongs to `app/`.
   */
  integrations: string[];
  /** Full SKILL.md body, trimmed; null when the host had none to give. */
  instructions: string | null;
}

const EMPTY: SkillPreviewSections = {
  category: null,
  tags: [],
  integrations: [],
  instructions: null,
};

/**
 * Normalizes a loaded {@link CommunitySkillPreview} into the sections the modal
 * renders. The preview comes from hand-authored SKILL.md frontmatter, so the
 * fields arrive padded, blank, duplicated, or (untrusted YAML) not strings at
 * all. Trimming + deduping here keeps chip keys unique and stops a `tags: [""]`
 * skill from rendering a ghost pill.
 */
export function skillPreviewSections(
  preview: CommunitySkillPreview | null | undefined,
): SkillPreviewSections {
  if (!preview) return EMPTY;
  const category = cleanText(preview.category);
  return {
    category,
    // A tag repeating the category ("Marketing" + tags: [marketing]) would
    // render the same word twice, chip over pill — the category wins.
    tags: cleanList(preview.tags).filter(
      (tag) => tag.toLowerCase() !== category?.toLowerCase(),
    ),
    integrations: cleanList(preview.integrations),
    instructions: cleanText(preview.content),
  };
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = cleanText(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
