/**
 * Wire types for the skills MARKETPLACE — the community directory a skill is
 * searched in and the GitHub repositories one can be read out of — plus the
 * command vocabulary the bridge dispatches them by.
 *
 * Kept beside the agent's own skills rather than in their `types.ts`: a
 * marketplace shape describes a catalogue entry that lives OUTSIDE Houston and
 * has no id an installed skill would recognise, so nothing here is reused by the
 * agent-scoped skill types and a change to one never travels to the other.
 */

import type { HttpScope } from "../http";

/** A failed marketplace request. `status` is the upstream HTTP status. */
export class MarketplaceHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MarketplaceHttpError";
  }
}

/**
 * The transport scope every marketplace call shares: the engine base, the
 * injected `fetch`, the 401 signal, and the module's own error type.
 */
export function marketplaceScope(
  baseUrl: string,
  ports: HttpScope["ports"],
  onUnauthorized: () => void,
): HttpScope {
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    ports,
    onUnauthorized,
    fail: (message, status) =>
      new MarketplaceHttpError(
        message || `marketplace request failed: ${status}`,
        status,
      ),
  };
}

/** One hit from the community directory, as the catalogue returns it. */
export interface CommunitySkill {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
}

/** Full detail fetched on-demand for a community skill, read from its real SKILL.md. */
export interface CommunitySkillPreview {
  title: string | null;
  description: string;
  image: string | null;
  category: string | null;
  tags: string[];
  /** Composio toolkit slugs declared in the skill's frontmatter (e.g. "gmail"). */
  integrations: string[];
  /** Full SKILL.md markdown body with frontmatter stripped; null when unavailable. */
  content: string | null;
}

/** One skill a GitHub repository publishes, by the path it lives at. */
export interface RepoSkill {
  id: string;
  name: string;
  description: string;
  path: string;
}

/**
 * The marketplace vocabulary — the same constants back the facade and the
 * bridge. Each name is the request function's own, so a dispatched command and
 * the assistant's catalog operation are one vocabulary, not two.
 */
export const MarketplaceCommand = {
  SearchCommunity: "skills/searchCommunitySkills",
  PreviewCommunity: "skills/previewCommunitySkill",
  ListFromRepo: "skills/listSkillsFromRepo",
  InstallCommunity: "skills/installCommunitySkill",
  InstallFromRepo: "skills/installSkillsFromRepo",
} as const;

export type MarketplaceCommandType =
  (typeof MarketplaceCommand)[keyof typeof MarketplaceCommand];

/** The marketplace half of the skills facade, at `sdk.skills.marketplace`. */
export interface SkillsMarketplace {
  /** Search the community directory for an agent. */
  searchCommunitySkills(
    agentId: string,
    query: string,
    signal?: AbortSignal,
  ): Promise<CommunitySkill[]>;
  /** Read one catalogue entry's full detail before installing it. */
  previewCommunitySkill(
    agentId: string,
    source: string,
    skillId: string,
    signal?: AbortSignal,
  ): Promise<CommunitySkillPreview>;
  /** List the skills a GitHub repository publishes. */
  listSkillsFromRepo(
    agentId: string,
    source: string,
    signal?: AbortSignal,
  ): Promise<RepoSkill[]>;
  /** Install one community skill; answers the installed skill's slug. */
  installCommunitySkill(
    agentId: string,
    body: { source: string; skillId: string },
    signal?: AbortSignal,
  ): Promise<string>;
  /** Install a selection from a repository; answers the installed slugs. */
  installSkillsFromRepo(
    agentId: string,
    body: { source: string; skills: RepoSkill[] },
    signal?: AbortSignal,
  ): Promise<string[]>;
}

/** The string at `key`, or a throw — a bridge payload arrives untyped. */
export function requireString(payload: unknown, key: string): string {
  const value = (payload as Record<string, unknown> | null)?.[key];
  if (typeof value !== "string" || value === "")
    throw new Error(`'${key}' is required`);
  return value;
}

/**
 * The string at `key`, empty included, or a throw. Separate from
 * {@link requireString} because a repository skill legitimately carries an
 * empty description — refusing it would block installing a real skill whose
 * SKILL.md says nothing about itself.
 */
function requireText(payload: unknown, key: string): string {
  const value = (payload as Record<string, unknown> | null)?.[key];
  if (typeof value !== "string") throw new Error(`'${key}' is required`);
  return value;
}

/** The record at `key`, or a throw. Narrowed further by the callers below. */
function requireObject(payload: unknown, key: string): Record<string, unknown> {
  const value = (payload as Record<string, unknown> | null)?.[key];
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`'${key}' is required`);
  return value as Record<string, unknown>;
}

/** The community install body at `key`, with both catalogue coordinates. */
export function requireCommunityInstall(
  payload: unknown,
  key: string,
): { source: string; skillId: string } {
  const body = requireObject(payload, key);
  return {
    source: requireString(body, "source"),
    skillId: requireString(body, "skillId"),
  };
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
  if (!Array.isArray(skills)) throw new Error("'skills' is required");
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
