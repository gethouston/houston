import type { SkillDetail, SkillSummary } from "@houston/protocol";
import { frontmatterScalar } from "./state-shared-skills";
import { emitDomain } from "./state-store";

type SkillRow = SkillSummary & { content: string };

const skillsByAgent = new Map<string, Map<string, SkillRow>>();

function agentSkills(agentId: string): Map<string, SkillRow> {
  let skills = skillsByAgent.get(agentId);
  if (!skills) {
    skills = new Map();
    skillsByAgent.set(agentId, skills);
  }
  return skills;
}

function row(name: string, description: string, content: string): SkillRow {
  return {
    name,
    title: null,
    description,
    version: 1,
    tags: [],
    created: null,
    lastUsed: null,
    category: null,
    featured: false,
    integrations: [],
    image: null,
    content,
  };
}

export function listSkills(agentId: string): SkillSummary[] {
  return [...agentSkills(agentId).values()].map(
    ({ content: _content, ...summary }) => summary,
  );
}

export function loadSkill(agentId: string, slug: string): SkillDetail | null {
  const skill = agentSkills(agentId).get(slug);
  if (!skill) return null;
  return {
    name: skill.name,
    title: skill.title,
    description: skill.description,
    version: skill.version,
    content: skill.content,
  };
}

export function createSkill(
  agentId: string,
  input: { name?: string; description?: string; content?: string },
): void {
  const name = input.name ?? "skill";
  agentSkills(agentId).set(
    name,
    row(name, input.description ?? "", input.content ?? ""),
  );
  emitDomain("SkillsChanged", agentId);
}

function refresh(skill: SkillRow, content: string): void {
  skill.content = content;
  skill.title = frontmatterScalar(content, "title");
  const description = frontmatterScalar(content, "description");
  if (description !== null) skill.description = description;
}

export function saveSkill(
  agentId: string,
  slug: string,
  content: string,
): boolean {
  const skill = agentSkills(agentId).get(slug);
  if (!skill) return false;
  refresh(skill, content);
  emitDomain("SkillsChanged", agentId);
  return true;
}

export function writeSkillFile(
  agentId: string,
  slug: string,
  content: string,
): void {
  const skills = agentSkills(agentId);
  const skill = skills.get(slug) ?? row(slug, "", content);
  refresh(skill, content);
  skills.set(slug, skill);
  emitDomain("SkillsChanged", agentId);
}

export function deleteSkill(agentId: string, slug: string): boolean {
  const removed = agentSkills(agentId).delete(slug);
  if (removed) emitDomain("SkillsChanged", agentId);
  return removed;
}

export function resetSkills(): void {
  skillsByAgent.clear();
}
