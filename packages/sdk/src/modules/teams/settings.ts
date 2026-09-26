/**
 * The PER-AGENT policy calls (Teams v2): who may drive one shared agent, the
 * toolkit and model ceilings a manager sets on it, the acting user's own model
 * pick underneath that ceiling, and whether its routine triggers are live.
 *
 * Gateway-only: assignments and ceilings are multiplayer concepts a
 * single-user host has nothing to resolve them against. Nothing here degrades — a non-2xx always throws a `TeamsHttpError`
 * carrying the HTTP `status`, so the two surfaces a pre-Teams gateway answers
 * `404` for (model choice, trigger status) reach their caller, which decides
 * for itself whether that hides a control or is a failure.
 */

import { type HttpScope, httpRequest } from "../http";
import type {
  AgentAssignment,
  AgentModelChoice,
  AgentModelChoiceInfo,
  AgentSettings,
  AgentSettingsUpdate,
  TriggerStatusItem,
} from "./policy-types";

/**
 * Chooses who may use an agent, and at what access level.
 * @param agentSlugOrId The agent this acts on, by the id or slug listAgents
 *   returns. Read it from listAgents rather than writing the name the user
 *   says.
 * @param assignments Who may use the agent, by the user ids getOrgPeople
 *   returns.
 * @assistant group:teams
 * @assistant confirm: outward. It decides who in the space may use this agent, so the wrong list hands out or takes away access.
 */
export async function setAgentAssignments(
  scope: HttpScope,
  agentSlugOrId: string,
  assignments: AgentAssignment[],
): Promise<void> {
  await httpRequest(
    scope,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/assignments`,
    { method: "PUT", body: JSON.stringify({ assignments }) },
  );
}

/**
 * Reads which apps and AI models an agent is allowed to use.
 * @param agentSlugOrId The agent this acts on, by the id or slug listAgents
 *   returns. Read it from listAgents rather than writing the name the user
 *   says.
 * @assistant group:teams
 */
export async function getAgentSettings(
  scope: HttpScope,
  agentSlugOrId: string,
): Promise<AgentSettings> {
  const res = await httpRequest(
    scope,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/settings`,
  );
  return (await res.json()) as AgentSettings;
}

/**
 * Chooses which apps and AI models an agent is allowed to use.
 *
 * Replace this agent's manager-set settings. The gateway READ-THEN-MERGES the
 * body, so forwarding only the keys the caller set is the whole contract — a
 * one-ceiling PUT leaves the other untouched.
 * @param agentSlugOrId The agent this acts on, by the id or slug listAgents
 *   returns. Read it from listAgents rather than writing the name the user
 *   says.
 * @param settings The ceilings to set. Pass only what changes: an omitted
 *   key is left alone, and null means no limit.
 * @assistant group:teams
 * @assistant confirm: outward. These ceilings decide which apps and models every teammate's turns may use, for everyone who shares the agent.
 */
export async function setAgentSettings(
  scope: HttpScope,
  agentSlugOrId: string,
  settings: AgentSettingsUpdate,
): Promise<void> {
  await httpRequest(
    scope,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/settings`,
    { method: "PUT", body: JSON.stringify(settings) },
  );
}

/**
 * Reads which AI model the user picked for an agent.
 *
 * The ACTING user's model choice for this agent plus its effective
 * `allowedModels` ceiling. A gateway that does not serve model choices — a
 * non-Teams host — answers 404 like any other failure, and the caller degrades
 * that to "no choice to make" so the composer falls back to single-player
 * behavior.
 * @param agentSlugOrId The agent this acts on, by the id or slug listAgents
 *   returns. Read it from listAgents rather than writing the name the user
 *   says.
 * @assistant group:agents
 */
export async function getAgentModelChoice(
  scope: HttpScope,
  agentSlugOrId: string,
): Promise<AgentModelChoiceInfo> {
  const res = await httpRequest(
    scope,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/model-choice`,
  );
  return (await res.json()) as AgentModelChoiceInfo;
}

/**
 * Chooses which AI model an agent uses.
 *
 * Set the ACTING user's model choice for this agent (gateway clamps to ceiling).
 *
 * @param agentSlugOrId The agent this acts on, by the id or slug listAgents
 *   returns. Read it from listAgents rather than writing the name the user
 *   says.
 * @param choice Which AI to use: a provider connected here
 *   (listAgentProviders lists them), one of the models this agent is
 *   allowed (getAgentModelChoice returns the allowed set) and optionally
 *   how hard it should think, one of low, medium, high or xhigh.
 * @assistant group:agents
 * @assistant confirm: money. The choice sets the rate every later turn with this agent is billed at.
 */
export async function setAgentModelChoice(
  scope: HttpScope,
  agentSlugOrId: string,
  choice: AgentModelChoice,
): Promise<void> {
  await httpRequest(
    scope,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/model-choice`,
    { method: "PUT", body: JSON.stringify(choice) },
  );
}

/**
 * Checks whether an agent's routine triggers are ready.
 *
 * One agent's per-routine trigger status (C9). A gateway that does not serve
 * triggers answers 404 like any other failure; the caller reads that as
 * "triggers unsupported here" and hides the badge.
 * @param agentSlugOrId The agent this acts on, by the id or slug listAgents
 *   returns. Read it from listAgents rather than writing the name the user
 *   says.
 * @assistant group:routines
 */
export async function agentTriggerStatus(
  scope: HttpScope,
  agentSlugOrId: string,
): Promise<TriggerStatusItem[]> {
  const res = await httpRequest(
    scope,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/trigger-status`,
  );
  return ((await res.json()) as { items: TriggerStatusItem[] }).items;
}
