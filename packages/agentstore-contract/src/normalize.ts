import { AGENT_IR_VERSION, INTEGRATION_REGEX, SLUG_REGEX } from "./ir";
import { parseSkillFrontmatter } from "./skill-frontmatter";
import { slugify } from "./slug";

const UNCLAIMED_DISPLAY_NAME = "Unclaimed";
const DEFAULT_CATEGORY = "other";
const DEFAULT_NAME = "Untitled agent";
const DEFAULT_SLUG = "agent";

const MAX_ID_LEN = 64;

// WHY: Trim the base before the suffix or a 64-char base loops forever. ADR-0081
const disambiguate = (base: string, seen: Set<string>): string => {
  let uniq = base;
  let n = 2;
  while (seen.has(uniq)) {
    const suffix = `-${n++}`;
    uniq = base.slice(0, MAX_ID_LEN - suffix.length) + suffix;
  }
  return uniq;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const isValidSlug = (v: unknown): v is string =>
  typeof v === "string" && SLUG_REGEX.test(v);

export function normalizeAgentIr(input: unknown): {
  ir: unknown;
  notes: string[];
} {
  const notes: string[] = [];
  if (!isRecord(input)) {
    return { ir: input, notes };
  }

  const candidate: Record<string, unknown> = { ...input };

  candidate.irVersion = AGENT_IR_VERSION;

  const identity: Record<string, unknown> = isRecord(candidate.identity)
    ? { ...candidate.identity }
    : {};

  const name = isNonEmptyString(identity.name)
    ? identity.name.trim().slice(0, 120)
    : DEFAULT_NAME;
  identity.name = name;

  if (!isValidSlug(identity.slug)) {
    identity.slug = slugify(name) || DEFAULT_SLUG;
    notes.push("identity.slug derived from name");
  }

  if (!isNonEmptyString(identity.description)) {
    identity.description = isNonEmptyString(identity.tagline)
      ? identity.tagline.trim()
      : name;
    notes.push("identity.description defaulted");
  }

  if (isNonEmptyString(identity.category)) {
    const category = slugify(identity.category);
    identity.category = category || DEFAULT_CATEGORY;
  } else {
    identity.category = DEFAULT_CATEGORY;
    notes.push("identity.category defaulted");
  }

  if (Array.isArray(identity.tags)) {
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const raw of identity.tags) {
      if (typeof raw !== "string") continue;
      const tag = slugify(raw);
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      tags.push(tag);
      if (tags.length === 6) break;
    }
    identity.tags = tags;
  }

  if (
    !isRecord(identity.creator) ||
    !isNonEmptyString(identity.creator.displayName)
  ) {
    identity.creator = { displayName: UNCLAIMED_DISPLAY_NAME };
    notes.push("identity.creator placeholder injected");
  }

  candidate.identity = identity;

  if (typeof candidate.instructions !== "string") {
    candidate.instructions = "";
    notes.push("instructions defaulted to empty");
  }

  if (Array.isArray(candidate.skills)) {
    const seen = new Set<string>();
    candidate.skills = candidate.skills.map((raw, i) => {
      const skill: Record<string, unknown> = isRecord(raw) ? { ...raw } : {};
      const body = typeof skill.body === "string" ? skill.body : "";
      skill.body = body;

      let base = isValidSlug(skill.slug) ? (skill.slug as string) : "";
      if (!base) {
        const fm = parseSkillFrontmatter(body);
        base = slugify(fm.title ?? "") || `skill-${i + 1}`;
        notes.push(`skills[${i}].slug derived`);
      }

      const uniq = disambiguate(base, seen);
      seen.add(uniq);
      skill.slug = uniq;
      return skill;
    });
  }

  if (Array.isArray(candidate.learnings)) {
    const seen = new Set<string>();
    candidate.learnings = candidate.learnings.map((raw, i) => {
      const learning: Record<string, unknown> = isRecord(raw) ? { ...raw } : {};
      let base = isNonEmptyString(learning.id)
        ? learning.id.trim().slice(0, MAX_ID_LEN)
        : "";
      if (!base) {
        base = `learning-${i + 1}`;
        notes.push(`learnings[${i}].id derived`);
      }
      const uniq = disambiguate(base, seen);
      seen.add(uniq);
      learning.id = uniq;
      return learning;
    });
  }

  if (Array.isArray(candidate.integrations)) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of candidate.integrations) {
      if (typeof raw !== "string") continue;
      const slug = raw.trim().toUpperCase();
      if (!INTEGRATION_REGEX.test(slug) || seen.has(slug)) continue;
      seen.add(slug);
      out.push(slug);
    }
    candidate.integrations = out;
  }

  const provenance: Record<string, unknown> = isRecord(candidate.provenance)
    ? { ...candidate.provenance }
    : {};
  if (
    provenance.createdVia !== "houston" &&
    provenance.createdVia !== "agent-post"
  ) {
    provenance.createdVia = "agent-post";
    notes.push("provenance.createdVia defaulted to agent-post");
  }
  candidate.provenance = provenance;

  return { ir: candidate, notes };
}
