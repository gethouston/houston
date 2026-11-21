import type {
  SkillDetail,
  SkillSummary,
  SkillWorkflow,
} from "@houston/protocol";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { skillsDirKey } from "./layout";
import {
  HOUSTON_SKILL_SCHEMA_VERSION,
  isHoustonSkillFrontmatter,
  parseHoustonSkillWorkflow,
} from "./skill-workflow";
import type { DocDiagnostic, FileStore } from "./store";

export const skillKeyInDir = (dir: string, slug: string) =>
  `${dir}/${slug}/SKILL.md`;

export const skillDirKeyInDir = (dir: string, slug: string) => `${dir}/${slug}`;

export const skillKey = (root: string, slug: string) =>
  skillKeyInDir(skillsDirKey(root), slug);

export const skillDirKey = (root: string, slug: string) =>
  skillDirKeyInDir(skillsDirKey(root), slug);

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

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
):
  | { summary: SkillSummary; body: string; workflow: SkillWorkflow | null }
  | { error: string } {
  const m = content.match(FM);
  if (!m) return { error: `SKILL.md for '${slug}' has no YAML frontmatter` };
  let fm: Record<string, unknown>;
  try {
    const parsed = parseYaml(m[1] ?? "") as unknown;
    if (typeof parsed !== "object" || parsed === null)
      return { error: `frontmatter of '${slug}' is not a map` };
    fm = parsed as Record<string, unknown>;
  } catch (err) {
    return {
      error: `frontmatter of '${slug}' is not valid YAML: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const summary: SkillSummary = {
    name: slug,
    title: str(fm.title),
    description: str(fm.description) ?? "",
    version: typeof fm.version === "number" ? fm.version : 1,
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
    created: str(fm.created),
    lastUsed: str(fm.last_used),
    category: str(fm.category),
    featured: truthy(fm.featured),
    integrations: Array.isArray(fm.integrations)
      ? fm.integrations.map(String)
      : [],
    image: str(fm.image),
    setupActivityId: str(fm.setup_activity_id),
  };
  const body = m[2] ?? "";
  return {
    summary,
    body,
    workflow: isHoustonSkillFrontmatter(fm)
      ? parseHoustonSkillWorkflow(body)
      : null,
  };
}

export async function loadSkillsFromDir(
  store: FileStore,
  dir: string,
): Promise<{ items: SkillSummary[]; diagnostics: DocDiagnostic[] }> {
  const keys = await store.list(dir);
  const slugs = [
    ...new Set(
      keys
        .filter((k) => k.endsWith("/SKILL.md"))
        .map((k) => k.slice(dir.length + 1).split("/")[0] ?? "")
        .filter(Boolean),
    ),
  ].sort();

  const items: SkillSummary[] = [];
  const diagnostics: DocDiagnostic[] = [];
  for (const slug of slugs) {
    const key = skillKeyInDir(dir, slug);
    const content = await store.readText(key);
    if (content === null) continue;
    const parsed = parseSkillMd(slug, content);
    if ("error" in parsed) diagnostics.push({ key, message: parsed.error });
    else items.push(parsed.summary);
  }
  return { items, diagnostics };
}

export const loadSkills = (store: FileStore, root: string) =>
  loadSkillsFromDir(store, skillsDirKey(root));

export async function loadSkillDetailFromDir(
  store: FileStore,
  dir: string,
  slug: string,
): Promise<SkillDetail | null> {
  const content = await store.readText(skillKeyInDir(dir, slug));
  if (content === null) return null;
  const parsed = parseSkillMd(slug, content);
  if ("error" in parsed) {
    return {
      name: slug,
      title: null,
      description: "",
      version: 1,
      content,
      workflow: null,
    };
  }
  return {
    name: parsed.summary.name,
    title: parsed.summary.title,
    description: parsed.summary.description,
    version: parsed.summary.version,
    content,
    workflow: parsed.workflow,
  };
}

export const loadSkillDetail = (store: FileStore, root: string, slug: string) =>
  loadSkillDetailFromDir(store, skillsDirKey(root), slug);

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
    x_houston: {
      created_by: "houston",
      skill_schema: HOUSTON_SKILL_SCHEMA_VERSION,
    },
  }).trimEnd();
  const body = input.content.trim();
  return `---\n${fm}\n---\n\n${body}\n`;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
