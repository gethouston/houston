/**
 * The GitHub REPOSITORY skill calls: listing what a repository publishes, and
 * installing the entries the user picked.
 *
 * Repository reads ride the same agent scope as installs: the Add Skills
 * dialog always browses FOR a specific agent, and the hosted gateway proxies
 * nothing but /agents/:slug/* (a top-level /v1/skills/* has no pod to land on
 * and 404s — the "Couldn't load suggestions" failure). The host serves the
 * read route agent-scoped too (skills-remote.ts), so one path shape works
 * against both the local sidecar and the gateway.
 *
 * Nothing is swallowed: a non-2xx always throws the scope's
 * `SkillsRepoHttpError` carrying the HTTP `status`, so a surface that wants
 * "no repository backend here" instead of an error says so itself and iOS is
 * never handed an empty listing it cannot tell from a real one.
 */

import type { ModuleContext } from "../../module-context";
import { type HttpScope, httpRequest, moduleScope } from "../http";
import { requireString } from "../payload";
import {
  type RepoSkill,
  requireRepoInstall,
  type SkillsRepo,
  SkillsRepoCommand,
  SkillsRepoHttpError,
} from "./types-skills-repo";

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
 * Installs skills from a GitHub repository into an agent.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param body The repository address, and the skills from
 *   listSkillsFromRepo to install.
 * @assistant group:skills
 * @assistant confirm: standing instruction. The agent starts following instructions from a repository the user has not read, in every later turn.
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

export function createSkillsRepo(ctx: ModuleContext): SkillsRepo {
  const scope = moduleScope(ctx, "skills-repo", SkillsRepoHttpError);

  ctx.registerCommand(SkillsRepoCommand.ListFromRepo, (p) =>
    listSkillsFromRepo(
      scope,
      requireString(p, "agentId"),
      requireString(p, "source"),
    ),
  );
  ctx.registerCommand(SkillsRepoCommand.InstallFromRepo, (p) =>
    installSkillsFromRepo(
      scope,
      requireString(p, "agentId"),
      requireRepoInstall(p, "body"),
    ),
  );

  return {
    listSkillsFromRepo: (agentId, source, signal) =>
      listSkillsFromRepo(scope, agentId, source, signal),
    installSkillsFromRepo: (agentId, body, signal) =>
      installSkillsFromRepo(scope, agentId, body, signal),
  };
}
