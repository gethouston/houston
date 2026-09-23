/**
 * An agent's skills MANIFEST — which of the skills it can reach are switched
 * on — over the injected `fetch`.
 *
 * The route replaces the whole enabled list, which is the right shape for the
 * screen that edits the list as a whole and the wrong one for a single skill
 * being switched on. {@link setSkillEnabled} is that single act: the read and
 * the write belong together, so they live here rather than in each surface
 * that needs one. The module factory serializes them per agent.
 */

import { type HttpScope, httpRequest } from "../http";
import type { SkillsManifest } from "./types-agent";

const manifestPath = (agentId: string) =>
  `/agents/${encodeURIComponent(agentId)}/skills-manifest`;

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
  const res = await httpRequest(scope, manifestPath(agentId));
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
  const res = await httpRequest(scope, manifestPath(agentId), {
    method: "PUT",
    body: JSON.stringify(manifest),
  });
  return (await res.json()) as SkillsManifest;
}

/**
 * Switches ONE of an agent's skills on or off, leaving the rest as they are.
 *
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param slug The skill's exact slug, from listSkills. Never invent one.
 * @param enabled True to switch the skill on for this agent, false to switch
 *   it off.
 * @assistant group:skills
 * @assistant hidden: the one-entry primitive behind putSkillsManifest, which is the one to dispatch; both write the same manifest, and this one reads it first so two switches started together cannot drop each other.
 */
export async function setSkillEnabled(
  scope: HttpScope,
  agentId: string,
  slug: string,
  enabled: boolean,
): Promise<SkillsManifest> {
  const read = await httpRequest(scope, manifestPath(agentId));
  const current = (await read.json()) as SkillsManifest;
  const next = new Set(current.enabled);
  if (enabled) next.add(slug);
  else next.delete(slug);
  const written = await httpRequest(scope, manifestPath(agentId), {
    method: "PUT",
    body: JSON.stringify({ version: 1, enabled: [...next].sort() }),
  });
  return (await written.json()) as SkillsManifest;
}
