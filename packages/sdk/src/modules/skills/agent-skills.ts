/**
 * The per-AGENT skill REST calls — the skills that live in one agent's own
 * `.agents/skills/`, plus that agent's skills manifest — over the injected
 * `fetch`.
 *
 * These are control-plane routes proxied to the agent's pod
 * (`/agents/:id/skills*`): the runtime client does not serve them, so the module
 * talks to them through {@link httpRequest} with literal paths, which is also
 * what keeps them visible to the assistant's operation catalog.
 *
 * Nothing is swallowed here: a non-2xx always throws an
 * {@link AgentSkillsHttpError} carrying the HTTP `status`, so a surface that
 * wants to degrade a 404 (a host without a skills backend) decides that itself.
 */

import { type HttpScope, httpRequest } from "../http";
import {
  type HostSkillSummary,
  type NewSkill,
  type SkillDetail,
  type SkillSummary,
  type SkillsManifest,
  toClientSummary,
} from "./types-agent";

/**
 * Lists the skills an agent can follow.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @assistant group:skills
 */
export async function listSkills(
  scope: HttpScope,
  agentId: string,
): Promise<SkillSummary[]> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/skills`,
  );
  const items = ((await res.json()) as { items: HostSkillSummary[] }).items;
  // The host dropped the legacy structured-inputs/prompt-template fields (the UI
  // ignores them); restore them as empty so the v1 SkillSummary type is satisfied.
  return items.map(toClientSummary);
}

/**
 * Reads a skill's instructions.
 *
 * A single skill's full detail (its SKILL.md content) from the host's
 * `GET /agents/:id/skills/:slug`. Without this the adapter's Proxy fallback
 * stubbed skill detail to `[]`, so clicking any skill showed no content.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param slug The skill's exact slug, from listSkills. Never invent one.
 * @assistant group:skills
 */
export async function loadSkill(
  scope: HttpScope,
  agentId: string,
  slug: string,
): Promise<SkillDetail> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(slug)}`,
  );
  return (await res.json()) as SkillDetail;
}

/**
 * Creates a skill an agent can follow.
 *
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param body The new skill: its name, a one-line description, and the
 *   instructions themselves.
 * @assistant group:skills
 * @assistant confirm: standing instruction. Once the skill exists the agent follows it in every later turn, changing behavior the user never asked for again.
 */
export async function createSkill(
  scope: HttpScope,
  agentId: string,
  body: NewSkill,
): Promise<void> {
  await httpRequest(scope, `/agents/${encodeURIComponent(agentId)}/skills`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Saves changes to a skill's instructions.
 *
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param slug The skill's exact slug, from listSkills. Never invent one.
 * @param content The skill's full new text. It replaces what was there, so
 *   send the whole thing.
 * @assistant group:skills
 * @assistant confirm: irreversible. It overwrites the skill's text in place and Houston keeps no earlier copy, so what the user wrote cannot be recovered.
 */
export async function saveSkill(
  scope: HttpScope,
  agentId: string,
  slug: string,
  content: string,
): Promise<void> {
  await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(slug)}`,
    {
      method: "PUT",
      body: JSON.stringify({ content }),
    },
  );
}

/**
 * Deletes a skill so the agent no longer has it.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param slug The skill's exact slug, from listSkills. Never invent one.
 * @assistant group:skills
 * @assistant confirm: irreversible. The skill's instructions are gone and Houston keeps no copy, so what the user wrote cannot be recovered.
 */
export async function deleteSkill(
  scope: HttpScope,
  agentId: string,
  slug: string,
): Promise<void> {
  await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(slug)}`,
    { method: "DELETE" },
  );
}

/**
 * Reads which of an agent's skills are switched on.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @assistant group:skills
 */
export async function getSkillsManifest(
  scope: HttpScope,
  agentId: string,
): Promise<SkillsManifest> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/skills-manifest`,
  );
  return (await res.json()) as SkillsManifest;
}

/**
 * Chooses which of an agent's skills are switched on.
 *
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param manifest The complete enabled skill list. Every omitted skill is
 *   disabled. Read getSkillsManifest first and send the full revised
 *   manifest.
 * @assistant group:skills
 * @assistant confirm: outward. It replaces the whole list, so every skill left out of it is switched off in the same call.
 */
export async function putSkillsManifest(
  scope: HttpScope,
  agentId: string,
  manifest: SkillsManifest,
): Promise<SkillsManifest> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/skills-manifest`,
    {
      method: "PUT",
      body: JSON.stringify(manifest),
    },
  );
  return (await res.json()) as SkillsManifest;
}
