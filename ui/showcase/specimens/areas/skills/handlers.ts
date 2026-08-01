import type { RepoSkill } from "@houston-ai/skills";

import { delay, repoSkills } from "./sample";

/**
 * The async callbacks `SkillsGrid` and `AddSkillDialog` need, faked with
 * timers: the dialog's stages (discovering → selecting → installing → done)
 * only exist while a promise is in flight, so a specimen that resolved
 * instantly would document half the component.
 *
 * Exports no `specimen` and no `sources`: a helper module for the pages beside
 * it.
 */

/** Discovers the SKILL.md files in a repo, as `onListFromRepo` does. */
export async function listFromRepo(source: string): Promise<RepoSkill[]> {
  await delay(900);
  return repoSkills.map((skill) => ({
    ...skill,
    path: `${source}/${skill.path}`,
  }));
}

/** The failure path: an unreachable or private repo, surfaced inline. */
export async function failListFromRepo(source: string): Promise<RepoSkill[]> {
  await delay(700);
  throw new Error(`Couldn't read ${source}. Check the repo is public.`);
}

/** Installs the picked skills and returns the slugs Houston stored. */
export async function installFromRepo(
  _source: string,
  skills: RepoSkill[],
): Promise<string[]> {
  await delay(1200);
  return skills.map((skill) => skill.name);
}

/** Creates a skill from the authored form and returns its slug. */
export async function createFromScratch(input: {
  name: string;
  description: string;
  content: string;
}): Promise<string> {
  await delay(900);
  return input.name;
}

/** Deletes an installed skill; the grid awaits it behind its confirm. */
export async function deleteSkill(_name: string): Promise<void> {
  await delay(600);
}
