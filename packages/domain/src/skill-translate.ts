import {
  clampLen,
  MAX_SKILL_DESCRIPTION_LEN,
  renderSkillMd,
} from "./skill-install";
import { parseSkillMd } from "./skills";

/**
 * Frontmatter-aware split + reassembly for translating an installed skill
 * (HOU-733). Only the human-language surfaces travel to the translator —
 * `title`, `description`, and the body — while identity and bookkeeping
 * (slug, version, dates, featured, integrations, image, tags, category) are
 * re-emitted verbatim from the original, so a translator (machine or model)
 * can never mangle a slug or reset the install metadata.
 *
 * Pure: callers read/write SKILL.md themselves.
 */

/** One translatable surface of a SKILL.md. */
export interface SkillTranslateSegment {
  id: "title" | "description" | "body";
  text: string;
}

/**
 * Extract the translatable segments of a SKILL.md. Empty surfaces are
 * omitted (nothing to translate). Unparseable frontmatter is an error — a
 * translation must never destroy a file it can't faithfully rebuild.
 */
export function skillTranslateSegments(
  slug: string,
  content: string,
): SkillTranslateSegment[] | { error: string } {
  const parsed = parseSkillMd(slug, content);
  if ("error" in parsed) return parsed;
  const segments: SkillTranslateSegment[] = [];
  const title = parsed.summary.title?.trim();
  if (title) segments.push({ id: "title", text: title });
  const description = parsed.summary.description.trim();
  if (description) segments.push({ id: "description", text: description });
  const body = parsed.body.trim();
  if (body) segments.push({ id: "body", text: body });
  return segments;
}

/**
 * Rebuild the SKILL.md with translated surfaces spliced in. Any surface the
 * translator did not return keeps the original text. The frontmatter is
 * rebuilt from the ORIGINAL parse (same field set `composeInstalledSkillMd`
 * emits), so nothing the translator says can touch identity or bookkeeping.
 */
export function composeTranslatedSkillMd(input: {
  slug: string;
  original: string;
  translated: Partial<Record<SkillTranslateSegment["id"], string>>;
}): string | { error: string } {
  const parsed = parseSkillMd(input.slug, input.original);
  if ("error" in parsed) return parsed;
  const s = parsed.summary;

  const pick = (id: SkillTranslateSegment["id"], fallback: string): string => {
    const t = input.translated[id]?.trim();
    return t || fallback;
  };

  const fm: Record<string, unknown> = {
    name: input.slug,
    description: clampLen(
      pick("description", s.description.trim()),
      MAX_SKILL_DESCRIPTION_LEN,
    ),
  };
  const title = pick("title", s.title?.trim() ?? "");
  if (title) fm.title = title;
  fm.version = s.version;
  if (s.created) fm.created = s.created;
  if (s.lastUsed) fm.last_used = s.lastUsed;
  if (s.category) fm.category = s.category;
  if (s.featured) fm.featured = true;
  if (s.integrations.length) fm.integrations = s.integrations;
  if (s.image) fm.image = s.image;
  if (s.tags.length) fm.tags = s.tags;

  return renderSkillMd(fm, pick("body", parsed.body.trim()));
}
