import type {
  SkillDetail,
  SkillSummary,
  SkillsManifest,
} from "@houston/protocol";
import { emitDomain } from "./state-store";

const sharedByWorkspace = new Map<string, Map<string, string>>();
const manifestsByAgent = new Map<string, SkillsManifest>();
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function workspaceSkills(workspaceId: string): Map<string, string> {
  let skills = sharedByWorkspace.get(workspaceId);
  if (!skills) {
    skills = new Map();
    sharedByWorkspace.set(workspaceId, skills);
  }
  return skills;
}

function scalar(frontmatter: string, key: string): string | null {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "string" || typeof parsed === "number"
      ? String(parsed)
      : raw;
  } catch {
    return raw;
  }
}

function summary(
  slug: string,
  content: string,
): { value: SkillSummary } | { error: string } {
  const match = content.match(FRONTMATTER);
  if (!match)
    return { error: `SKILL.md for '${slug}' has no YAML frontmatter` };
  const frontmatter = match[1] ?? "";
  const parsedVersion = Number(scalar(frontmatter, "version") ?? 1);
  return {
    value: {
      name: slug,
      title: scalar(frontmatter, "title"),
      description: scalar(frontmatter, "description") ?? "",
      version: Number.isFinite(parsedVersion) ? parsedVersion : 1,
      tags: [],
      created: scalar(frontmatter, "created"),
      lastUsed: null,
      category: null,
      featured: false,
      integrations: [],
      image: null,
    },
  };
}

function detail(slug: string, content: string): SkillDetail {
  const parsed = summary(slug, content);
  if ("error" in parsed) {
    return { name: slug, title: null, description: "", version: 1, content };
  }
  const { name, title, description, version } = parsed.value;
  return { name, title, description, version, content };
}

export function sharedSkillSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function listSharedSkills(workspaceId: string): {
  items: SkillSummary[];
  diagnostics: { key: string; message: string }[];
} {
  const items: SkillSummary[] = [];
  const diagnostics: { key: string; message: string }[] = [];
  for (const [slug, content] of [
    ...workspaceSkills(workspaceId).entries(),
  ].sort(([a], [b]) => a.localeCompare(b))) {
    const parsed = summary(slug, content);
    if ("error" in parsed) {
      diagnostics.push({
        key: `.shared/skills/${slug}/SKILL.md`,
        message: parsed.error,
      });
    } else {
      items.push(parsed.value);
    }
  }
  return { items, diagnostics };
}

export function loadSharedSkill(
  workspaceId: string,
  slug: string,
): SkillDetail | null {
  const content = workspaceSkills(workspaceId).get(slug);
  return content === undefined ? null : detail(slug, content);
}

export function createSharedSkill(
  workspaceId: string,
  input: { name: string; description: string; content: string },
): SkillDetail | null {
  const slug = sharedSkillSlug(input.name);
  const skills = workspaceSkills(workspaceId);
  if (!slug || skills.has(slug)) return null;
  const content = `---\nname: ${slug}\ndescription: ${JSON.stringify(input.description)}\nversion: 1\ncreated: 1970-01-01\n---\n\n${input.content.trim()}\n`;
  skills.set(slug, content);
  emitDomain("SharedSkillsChanged", undefined, workspaceId);
  return detail(slug, content);
}

/** "Share to workspace": verbatim SKILL.md at an exact slug; null if taken. */
export function promoteSharedSkill(
  workspaceId: string,
  slug: string,
  content: string,
): SkillDetail | null {
  const skills = workspaceSkills(workspaceId);
  if (skills.has(slug)) return null;
  skills.set(slug, content);
  emitDomain("SharedSkillsChanged", undefined, workspaceId);
  return detail(slug, content);
}

export function saveSharedSkill(
  workspaceId: string,
  slug: string,
  content: string,
): boolean {
  const skills = workspaceSkills(workspaceId);
  if (!skills.has(slug)) return false;
  skills.set(slug, content);
  emitDomain("SharedSkillsChanged", undefined, workspaceId);
  return true;
}

export function deleteSharedSkill(workspaceId: string, slug: string): boolean {
  const removed = workspaceSkills(workspaceId).delete(slug);
  if (removed) emitDomain("SharedSkillsChanged", undefined, workspaceId);
  return removed;
}

export function getSkillsManifest(agentId: string): SkillsManifest {
  return manifestsByAgent.get(agentId) ?? { version: 1, enabled: [] };
}

export function putSkillsManifest(
  agentId: string,
  input: Record<string, unknown>,
): SkillsManifest {
  const enabled = Array.isArray(input.enabled)
    ? [
        ...new Set(
          input.enabled.filter(
            (slug): slug is string =>
              typeof slug === "string" && slug.trim().length > 0,
          ),
        ),
      ].sort()
    : [];
  const manifest = { version: 1 as const, enabled };
  manifestsByAgent.set(agentId, manifest);
  emitDomain("SkillsChanged", agentId);
  return manifest;
}

export function resetSharedSkills(): void {
  sharedByWorkspace.clear();
  manifestsByAgent.clear();
}
