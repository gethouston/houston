/**
 * Parse the YAML frontmatter of a SKILL.md body, with the SAME rules as
 * `parseSkillMd` in `@houston/domain` (packages/domain/src/skills.ts): the `FM`
 * regex, the `yaml` parser, and the `str()` coercion (string as-is; number/Date
 * stringified; everything else null).
 *
 * IDENTITY RULE: this parser reads only DISPLAY fields (`title:`, `description:`,
 * etc.) and NEVER reads the frontmatter `name:` — agent-authored SKILL.md files
 * sometimes drift a display phrase into `name:` and trusting it makes lookups 404
 * (HOU-515/HOU-441). A skill's identity is the caller's own slug, which the
 * caller pairs with these display fields; it is not derived here.
 */
import { parse as parseYaml } from "yaml";

export interface SkillFrontmatter {
  title: string | null;
  description: string;
  integrations: string[];
  image: string | null;
  category: string | null;
}

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

const str = (v: unknown): string | null => {
  if (typeof v === "string") return v;
  if (typeof v === "number" || v instanceof Date) return String(v);
  return null;
};

const EMPTY: SkillFrontmatter = {
  title: null,
  description: "",
  integrations: [],
  image: null,
  category: null,
};

export function parseSkillFrontmatter(body: string): SkillFrontmatter {
  // Reads DISPLAY fields only; the frontmatter `name:` is deliberately ignored
  // (see IDENTITY RULE) so a drifting display phrase can never shadow the
  // caller's slug.
  const m = body.match(FM);
  if (!m) return { ...EMPTY };

  let fm: Record<string, unknown>;
  try {
    const parsed = parseYaml(m[1] ?? "") as unknown;
    if (typeof parsed !== "object" || parsed === null) return { ...EMPTY };
    fm = parsed as Record<string, unknown>;
  } catch {
    return { ...EMPTY };
  }

  return {
    title: str(fm.title),
    description: str(fm.description) ?? "",
    integrations: Array.isArray(fm.integrations)
      ? fm.integrations.map(String)
      : [],
    image: str(fm.image),
    category: str(fm.category),
  };
}
