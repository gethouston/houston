import { stringify as stringifyYaml } from "yaml";
import { parseSkillMd } from "./skills";

/**
 * Compose the SKILL.md for an installed community/repo skill, **preserving the
 * author's frontmatter** (description, category, integrations, image, tags)
 * instead of rebuilding a bare one like the create flow does.
 *
 * `slug` becomes both the on-disk directory and the frontmatter `name`, so the
 * two never drift. Bookkeeping is reset to a fresh install (version 1, today's
 * dates) and the skill is marked `featured` — the user explicitly chose to
 * install it, so it must surface on the chat empty state rather than hiding
 * under "Other". Falls back to a minimal skill (`fallbackDescription` + the
 * raw body) when the source has no parseable frontmatter, so a bare SKILL.md
 * still installs instead of failing.
 *
 * Pure: the caller supplies the date and writes the result to its store.
 */

export const MAX_SKILL_DESCRIPTION_LEN = 256;

export function composeInstalledSkillMd(input: {
  slug: string;
  rawMd: string;
  fallbackDescription: string;
  todayIsoDate: string;
}): string {
  const parsed = parseSkillMd(input.slug, input.rawMd);
  const source =
    "error" in parsed
      ? { summary: null, body: input.rawMd.trim() }
      : { summary: parsed.summary, body: parsed.body.trim() };

  const description = clampLen(
    (source.summary?.description.trim() || input.fallbackDescription).trim(),
    MAX_SKILL_DESCRIPTION_LEN,
  );

  const fm: Record<string, unknown> = {
    name: input.slug,
    description,
    version: 1,
    created: input.todayIsoDate,
    last_used: input.todayIsoDate,
  };
  if (source.summary?.category) fm.category = source.summary.category;
  fm.featured = true;
  if (source.summary?.integrations.length)
    fm.integrations = source.summary.integrations;
  if (source.summary?.image) fm.image = source.summary.image;
  if (source.summary?.tags.length) fm.tags = source.summary.tags;

  return `---\n${stringifyYaml(fm).trimEnd()}\n---\n\n${source.body}\n`;
}

/** Truncate to `max` characters without splitting a surrogate pair. */
function clampLen(s: string, max: number): string {
  if (s.length <= max) return s;
  const chars = [...s];
  let out = "";
  for (const c of chars) {
    if (out.length + c.length > max) break;
    out += c;
  }
  return out.trimEnd();
}
