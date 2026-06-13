import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { SkillDetail, SkillSummary } from "@houston/protocol";
import { skillsDirKey } from "./layout";
import type { DocDiagnostic, FileStore } from "./store";

/**
 * Skills on disk: `<root>/.agents/skills/<slug>/SKILL.md` (Agent Skills
 * standard — the SAME folders pi loads into the agent's prompt, see
 * packages/runtime resource-loader). YAML frontmatter drives discovery +
 * picker UI; the body is the procedure.
 */

export const skillKey = (root: string, slug: string) => `${skillsDirKey(root)}/${slug}/SKILL.md`;

/** The slug dir, for whole-skill deletion (host calls vfs.deletePrefix on it). */
export const skillDirKey = (root: string, slug: string) => `${skillsDirKey(root)}/${slug}`;

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * YAML 1.1 (Rust serde_yml) reads `featured: yes` as true; YAML 1.2 (this
 * parser) reads it as the string "yes". User files contain both — normalize.
 */
const truthy = (v: unknown): boolean =>
  v === true || (typeof v === "string" && /^(yes|true|on)$/i.test(v));

const str = (v: unknown): string | null => {
  if (typeof v === "string") return v;
  if (typeof v === "number" || v instanceof Date) return String(v);
  return null;
};

export function parseSkillMd(
  slug: string,
  content: string,
): { summary: SkillSummary; body: string } | { error: string } {
  const m = content.match(FM);
  if (!m) return { error: `SKILL.md for '${slug}' has no YAML frontmatter` };
  let fm: Record<string, unknown>;
  try {
    const parsed = parseYaml(m[1]!) as unknown;
    if (typeof parsed !== "object" || parsed === null) return { error: `frontmatter of '${slug}' is not a map` };
    fm = parsed as Record<string, unknown>;
  } catch (err) {
    return { error: `frontmatter of '${slug}' is not valid YAML: ${err instanceof Error ? err.message : String(err)}` };
  }
  const summary: SkillSummary = {
    name: str(fm.name) ?? slug,
    description: str(fm.description) ?? "",
    version: typeof fm.version === "number" ? fm.version : 1,
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
    created: str(fm.created),
    lastUsed: str(fm.last_used),
    category: str(fm.category),
    featured: truthy(fm.featured),
    integrations: Array.isArray(fm.integrations) ? fm.integrations.map(String) : [],
    image: str(fm.image),
  };
  return { summary, body: m[2] ?? "" };
}

/** List skills under the workspace root. Unparseable SKILL.md files surface as diagnostics. */
export async function loadSkills(
  store: FileStore,
  root: string,
): Promise<{ items: SkillSummary[]; diagnostics: DocDiagnostic[] }> {
  const dir = skillsDirKey(root);
  const keys = await store.list(dir);
  const slugs = [...new Set(
    keys
      .filter((k) => k.endsWith("/SKILL.md"))
      .map((k) => k.slice(dir.length + 1).split("/")[0]!)
      .filter(Boolean),
  )].sort();

  const items: SkillSummary[] = [];
  const diagnostics: DocDiagnostic[] = [];
  for (const slug of slugs) {
    const key = skillKey(root, slug);
    const content = await store.readText(key);
    if (content === null) continue; // listed dir without SKILL.md at top level
    const parsed = parseSkillMd(slug, content);
    if ("error" in parsed) diagnostics.push({ key, message: parsed.error });
    else items.push(parsed.summary);
  }
  return { items, diagnostics };
}

export async function loadSkillDetail(
  store: FileStore,
  root: string,
  slug: string,
): Promise<SkillDetail | null> {
  const content = await store.readText(skillKey(root, slug));
  if (content === null) return null;
  const parsed = parseSkillMd(slug, content);
  if ("error" in parsed) {
    return { name: slug, description: "", version: 1, content };
  }
  return {
    name: parsed.summary.name,
    description: parsed.summary.description,
    version: parsed.summary.version,
    content,
  };
}

/** Compose a fresh SKILL.md (create flow). Caller supplies the date (domain stays pure). */
export function composeSkillMd(input: {
  name: string;
  description: string;
  content: string;
  createdIsoDate: string;
}): string {
  const fm = stringifyYaml({
    name: input.name,
    description: input.description,
    version: 1,
    created: input.createdIsoDate,
  }).trimEnd();
  const body = input.content.trim();
  return `---\n${fm}\n---\n\n${body}\n`;
}

/** Kebab-case slug from a human name; empty when nothing survives. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
