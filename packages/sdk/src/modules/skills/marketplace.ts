/**
 * The skills MARKETPLACE calls: searching the community directory, previewing
 * an entry, and installing from the directory or from a GitHub repository.
 *
 * Marketplace reads ride the same agent scope as installs: the Add Skills
 * dialog always browses FOR a specific agent, and the hosted gateway proxies
 * nothing but /agents/:slug/* (a top-level /v1/skills/* has no pod to land on
 * and 404s — the "Couldn't load suggestions" failure). The host serves these
 * read routes agent-scoped too (skills-remote.ts), so one path shape works
 * against both the local sidecar and the gateway.
 *
 * Nothing is swallowed: a non-2xx always throws the scope's
 * `MarketplaceHttpError` carrying the HTTP `status`, so a surface that wants
 * "no marketplace here" instead of an error says so itself and iOS is never
 * handed an empty catalogue it cannot tell from a real one.
 */

import type { ModuleContext } from "../../module-context";
import { type HttpScope, httpRequest, moduleScope } from "../http";
import { requireString } from "../payload";
import {
  type CommunitySkill,
  type CommunitySkillPreview,
  MarketplaceCommand,
  MarketplaceHttpError,
  type RepoSkill,
  requireCommunityInstall,
  requireRepoInstall,
  type SkillsMarketplace,
} from "./types-marketplace";

/**
 * Searches the community directory of skills.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param query Words to search the community catalogue for, in the user's
 *   own terms.
 * @assistant group:skills unconfirmed: Read-only search; POST carries the search terms.
 */
export async function searchCommunitySkills(
  scope: HttpScope,
  agentId: string,
  query: string,
  signal?: AbortSignal,
): Promise<CommunitySkill[]> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/skills/community/search`,
    { method: "POST", body: JSON.stringify({ query }), signal },
  );
  return (await res.json()) as CommunitySkill[];
}

/**
 * Shows what a community skill does before installing it.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param source The catalogue entry's source, exactly as
 *   searchCommunitySkills returned it.
 * @param skillId The skill's id, exactly as searchCommunitySkills returned
 *   it.
 * @assistant group:skills unconfirmed: Read-only preview; POST carries the catalog source and skill id.
 */
export async function previewCommunitySkill(
  scope: HttpScope,
  agentId: string,
  source: string,
  skillId: string,
  signal?: AbortSignal,
): Promise<CommunitySkillPreview> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/skills/community/preview`,
    { method: "POST", body: JSON.stringify({ source, skillId }), signal },
  );
  return (await res.json()) as CommunitySkillPreview;
}

/**
 * Lists the skills published in a GitHub repository.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param source The full https address of the GitHub repository to read
 *   skills from.
 * @assistant group:skills unconfirmed: Read-only repository listing; POST carries the source address.
 */
export async function listSkillsFromRepo(
  scope: HttpScope,
  agentId: string,
  source: string,
  signal?: AbortSignal,
): Promise<RepoSkill[]> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/skills/repo/list`,
    { method: "POST", body: JSON.stringify({ source }), signal },
  );
  return (await res.json()) as RepoSkill[];
}

/**
 * Installs a skill from the community directory into an agent.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param body The skill to install, with the source and id exactly as
 *   searchCommunitySkills returned them.
 * @assistant group:skills confirm
 */
export async function installCommunitySkill(
  scope: HttpScope,
  agentId: string,
  body: { source: string; skillId: string },
  signal?: AbortSignal,
): Promise<string> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/skills/community/install`,
    { method: "POST", body: JSON.stringify(body), signal },
  );
  return (await res.json()) as string;
}

/**
 * Installs skills from a GitHub repository into an agent.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param body The repository address, and the skills from
 *   listSkillsFromRepo to install.
 * @assistant group:skills confirm
 */
export async function installSkillsFromRepo(
  scope: HttpScope,
  agentId: string,
  body: { source: string; skills: RepoSkill[] },
  signal?: AbortSignal,
): Promise<string[]> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/skills/repo/install`,
    { method: "POST", body: JSON.stringify(body), signal },
  );
  return (await res.json()) as string[];
}

export function createMarketplace(ctx: ModuleContext): SkillsMarketplace {
  const scope = moduleScope(ctx, "marketplace", MarketplaceHttpError);

  ctx.registerCommand(MarketplaceCommand.SearchCommunity, (p) =>
    searchCommunitySkills(
      scope,
      requireString(p, "agentId"),
      requireString(p, "query"),
    ),
  );
  ctx.registerCommand(MarketplaceCommand.PreviewCommunity, (p) =>
    previewCommunitySkill(
      scope,
      requireString(p, "agentId"),
      requireString(p, "source"),
      requireString(p, "skillId"),
    ),
  );
  ctx.registerCommand(MarketplaceCommand.ListFromRepo, (p) =>
    listSkillsFromRepo(
      scope,
      requireString(p, "agentId"),
      requireString(p, "source"),
    ),
  );
  ctx.registerCommand(MarketplaceCommand.InstallCommunity, (p) =>
    installCommunitySkill(
      scope,
      requireString(p, "agentId"),
      requireCommunityInstall(p, "body"),
    ),
  );
  ctx.registerCommand(MarketplaceCommand.InstallFromRepo, (p) =>
    installSkillsFromRepo(
      scope,
      requireString(p, "agentId"),
      requireRepoInstall(p, "body"),
    ),
  );

  return {
    searchCommunitySkills: (agentId, query, signal) =>
      searchCommunitySkills(scope, agentId, query, signal),
    previewCommunitySkill: (agentId, source, skillId, signal) =>
      previewCommunitySkill(scope, agentId, source, skillId, signal),
    listSkillsFromRepo: (agentId, source, signal) =>
      listSkillsFromRepo(scope, agentId, source, signal),
    installCommunitySkill: (agentId, body, signal) =>
      installCommunitySkill(scope, agentId, body, signal),
    installSkillsFromRepo: (agentId, body, signal) =>
      installSkillsFromRepo(scope, agentId, body, signal),
  };
}
