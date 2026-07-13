/**
 * Installed skills — a per-agent in-memory list so the Skills surface (the
 * installed-tile strip, the edit modal, delete) and the Add Skills flows
 * (GitHub repo install, from scratch) can be exercised end to end. The real
 * host stores these under `.agents/skills/*`; here a simple map suffices —
 * the UI only reads the REST surface. Mutations emit `SkillsChanged` so the
 * TanStack invalidation path refreshes exactly as against the real host.
 */

import type { SkillDetail, SkillSummary } from "@houston/protocol";
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

/** The GitHub-repo install: add every picked skill; returns installed names. */
export function installSkills(agentId: string, names: string[]): string[] {
  const skills = agentSkills(agentId);
  for (const name of names) {
    skills.set(name, row(name, `${name} from the repo`, `# ${name}\n`));
  }
  emitDomain("SkillsChanged", agentId);
  return names;
}

export function saveSkill(
  agentId: string,
  slug: string,
  content: string,
): boolean {
  const skill = agentSkills(agentId).get(slug);
  if (!skill) return false;
  skill.content = content;
  emitDomain("SkillsChanged", agentId);
  return true;
}

export function deleteSkill(agentId: string, slug: string): boolean {
  const removed = agentSkills(agentId).delete(slug);
  if (removed) emitDomain("SkillsChanged", agentId);
  return removed;
}

/** Restore the (empty) seed. Called from the store's `reset()`. */
export function resetSkills(): void {
  skillsByAgent.clear();
}
