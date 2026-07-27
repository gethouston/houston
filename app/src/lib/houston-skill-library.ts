/**
 * The Houston skill library (HOU-791 follow-up): the curated skills our
 * pre-set store agents ship, offered one-by-one on the Custom skills tab so
 * a user can pull "Research an account" into THEIR agent without installing
 * the whole Sales agent. Source = the release-bundled store templates
 * (`app/src/agents/builtin/store-templates/<id>.json`, locale variants
 * included) — the live Agent Store catalog has no published first-party
 * listings yet, and the bundle works offline and ships translated.
 *
 * This module is pure + node-test-safe (no vite globs, no React): the
 * template loading lives in `components/tabs/use-houston-skill-library.ts`.
 */

// The subpath export keeps this module node-test-safe: the contract's root
// index pulls extensionless vite-style imports node ESM can't resolve.
import { parseSkillFrontmatter } from "@houston/agentstore-contract/skill-frontmatter";

/** One installable library skill, display fields pre-parsed from its SKILL.md. */
export interface HoustonLibrarySkill {
  /** The skill's directory slug — its install identity. */
  slug: string;
  /** The pre-set agent this skill ships with (store template id). */
  agentId: string;
  title: string | null;
  description: string;
  image: string | null;
  category: string | null;
  integrations: string[];
  /** The full SKILL.md text, installed verbatim (minus the featured upgrade). */
  content: string;
  /** The markdown body with the frontmatter stripped — what the preview
   *  modal shows as the step-by-step instructions. */
  body: string;
}

const SKILL_SEED = /^\.agents\/skills\/([^/]+)\/SKILL\.md$/;
const FM_BLOCK = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

/** The SKILL.md markdown body with the frontmatter block stripped. */
export function skillBodyOf(content: string): string {
  return content.replace(FM_BLOCK, "").trim();
}

/**
 * The library entries inside one store template's seed map, sorted by slug.
 * Display fields come from the seed's own frontmatter (the same parser the
 * store contract uses — the caller's slug is the identity, never `name:`).
 */
export function extractTemplateSkills(
  agentId: string,
  seeds: Record<string, string>,
): HoustonLibrarySkill[] {
  const out: HoustonLibrarySkill[] = [];
  for (const [key, content] of Object.entries(seeds)) {
    const slug = key.match(SKILL_SEED)?.[1];
    if (!slug) continue;
    const fm = parseSkillFrontmatter(content);
    out.push({
      slug,
      agentId,
      title: fm.title,
      description: fm.description,
      image: fm.image,
      category: fm.category,
      integrations: fm.integrations,
      content,
      body: skillBodyOf(content),
    });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * The install-time frontmatter upgrade: an explicitly installed skill must be
 * findable, and the chat empty state shows only featured skills when any
 * exist (the same invariant `composeInstalledSkillMd` enforces for store /
 * repo installs). Rewrites an existing `featured:` line in the frontmatter
 * block, or inserts one before its closing `---`; content without a
 * frontmatter block is returned unchanged (nothing safe to edit).
 */
export function withFeaturedFrontmatter(content: string): string {
  const m = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/);
  if (!m) return content;
  const [, open, fm, close] = m;
  const body = content.slice(m[0].length);
  const rewritten = /^featured:.*$/m.test(fm ?? "")
    ? (fm ?? "").replace(/^featured:.*$/m, "featured: yes")
    : fm
      ? `${fm}\nfeatured: yes`
      : "featured: yes";
  return `${open}${rewritten}${close}${body}`;
}
