/**
 * Wire types for the GitHub REPOSITORY skills — the repositories an agent's
 * skills can be read out of — plus the command vocabulary `dispatch` routes
 * them by.
 *
 * Kept beside the agent's own skills rather than in their `types.ts`: a
 * repository shape describes a SKILL.md that lives OUTSIDE Houston and has no
 * id an installed skill would recognise, so nothing here is reused by the
 * agent-scoped skill types and a change to one never travels to the other.
 */

import { SdkHttpError } from "../http";
import { field, requireString } from "../payload";

/** A failed repository request. `status` is the upstream HTTP status. */
export class SkillsRepoHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "SkillsRepoHttpError");
  }
}

/** One skill a GitHub repository publishes, by the path it lives at. */
export interface RepoSkill {
  id: string;
  name: string;
  description: string;
  path: string;
}

/**
 * The repository vocabulary — the same constants back the facade and the
 * dispatch path. `skills.repo` is the family half of `<family>/<verb>`, which
 * is what keeps these apart from an agent's own `skills/*`.
 */
export const SkillsRepoCommand = {
  ListFromRepo: "skills.repo/listFromRepo",
  InstallFromRepo: "skills.repo/installFromRepo",
} as const;

export type SkillsRepoCommandType =
  (typeof SkillsRepoCommand)[keyof typeof SkillsRepoCommand];

/** The repository half of the skills facade, at `sdk.skills.repo`. */
export interface SkillsRepo {
  /** List the skills a GitHub repository publishes. */
  listSkillsFromRepo(
    agentId: string,
    source: string,
    signal?: AbortSignal,
  ): Promise<RepoSkill[]>;
  /** Install a selection from a repository; answers the installed slugs. */
  installSkillsFromRepo(
    agentId: string,
    body: { source: string; skills: RepoSkill[] },
    signal?: AbortSignal,
  ): Promise<string[]>;
}

/**
 * The string at `key`, empty included, or a throw. Separate from
 * {@link requireString} because a repository skill legitimately carries an
 * empty description — refusing it would block installing a real skill whose
 * SKILL.md says nothing about itself.
 */
function requireText(payload: unknown, key: string): string {
  const value = field(payload, key);
  if (typeof value !== "string") throw new Error(`missing '${key}'`);
  return value;
}

/** The record at `key`, or a throw. Narrowed further by the callers below. */
function requireObject(payload: unknown, key: string): Record<string, unknown> {
  const value = field(payload, key);
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`missing '${key}'`);
  return value as Record<string, unknown>;
}

/**
 * The repository install body at `key`: the repository address plus the exact
 * skills `listSkillsFromRepo` returned. Every field of every skill is checked,
 * because the host writes each one to disk under the id it is given.
 */
export function requireRepoInstall(
  payload: unknown,
  key: string,
): { source: string; skills: RepoSkill[] } {
  const body = requireObject(payload, key);
  const skills = body.skills;
  if (!Array.isArray(skills)) throw new Error("missing 'skills'");
  return {
    source: requireString(body, "source"),
    skills: skills.map((skill) => ({
      id: requireString(skill, "id"),
      name: requireString(skill, "name"),
      description: requireText(skill, "description"),
      path: requireString(skill, "path"),
    })),
  };
}
