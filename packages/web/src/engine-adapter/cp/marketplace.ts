import type {
  CommunitySkill,
  CommunitySkillPreview,
  RepoSkill,
} from "../../../../../ui/engine-client/src/types";
import { agentPath, type ControlPlaneConfig, cpFetch } from "./fetch";

// Marketplace reads ride the same agent scope as installs: the Add Skills
// dialog always browses FOR a specific agent, and the hosted gateway proxies
// nothing but /agents/:slug/* (a top-level /v1/skills/* has no pod to land on
// and 404s — the "Couldn't load suggestions" failure). The host serves these
// read routes agent-scoped too (skills-remote.ts), so one path shape works
// against both the local sidecar and the gateway.
/**
 * Searches the community directory of skills.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param query Words to search the community catalogue for, in the user's
 *   own terms.
 * @assistant group:skills
 */
export async function searchCommunitySkills(
  cfg: ControlPlaneConfig,
  agentId: string,
  query: string,
  signal?: AbortSignal,
): Promise<CommunitySkill[]> {
  const res = await cpFetch(
    cfg,
    `${agentPath(agentId)}/skills/community/search`,
    {
      method: "POST",
      body: JSON.stringify({ query }),
      signal,
    },
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
 * @assistant group:skills
 */
export async function previewCommunitySkill(
  cfg: ControlPlaneConfig,
  agentId: string,
  source: string,
  skillId: string,
  signal?: AbortSignal,
): Promise<CommunitySkillPreview> {
  const res = await cpFetch(
    cfg,
    `${agentPath(agentId)}/skills/community/preview`,
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
 * @assistant group:skills
 */
export async function listSkillsFromRepo(
  cfg: ControlPlaneConfig,
  agentId: string,
  source: string,
  signal?: AbortSignal,
): Promise<RepoSkill[]> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/skills/repo/list`, {
    method: "POST",
    body: JSON.stringify({ source }),
    signal,
  });
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
  cfg: ControlPlaneConfig,
  agentId: string,
  body: { source: string; skillId: string },
  signal?: AbortSignal,
): Promise<string> {
  const res = await cpFetch(
    cfg,
    `${agentPath(agentId)}/skills/community/install`,
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
  cfg: ControlPlaneConfig,
  agentId: string,
  body: { source: string; skills: RepoSkill[] },
  signal?: AbortSignal,
): Promise<string[]> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/skills/repo/install`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
  return (await res.json()) as string[];
}
