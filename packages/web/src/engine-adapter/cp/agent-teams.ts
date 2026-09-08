import type {
  AgentAssignment,
  AgentModelChoice,
  AgentModelChoiceInfo,
  AgentSettings,
  TriggerStatusItem,
} from "../../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "../client/errors";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * Chooses who may use an agent, and at what access level.
 * @param agentSlugOrId The agent this acts on, by the id or slug listAgents
 *   returns. Read it from listAgents rather than writing the name the user
 *   says.
 * @param assignments Who may use the agent, by the user ids getOrgPeople
 *   returns.
 * @assistant group:teams confirm
 * @assistant unroutable: debt: the body is chosen client-side between the v1 userIds and v2 assignments shapes; routable once callers pass only assignments.
 */
export async function setAgentAssignments(
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
  assignments: AgentAssignment[] | string[],
): Promise<void> {
  const isV2 = assignments.length > 0 && typeof assignments[0] !== "string";
  const body = isV2
    ? { assignments: assignments as AgentAssignment[] }
    : { userIds: assignments as string[] };
  await cpFetch(
    cfg,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/assignments`,
    { method: "PUT", body: JSON.stringify(body) },
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
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
): Promise<AgentSettings> {
  const res = await cpFetch(
    cfg,
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
 * @assistant group:teams confirm
 */
export async function setAgentSettings(
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
  settings: {
    allowedToolkits?: string[] | null;
    allowedModels?: string[] | null;
  },
): Promise<void> {
  await cpFetch(
    cfg,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/settings`,
    { method: "PUT", body: JSON.stringify(settings) },
  );
}

/**
 * Reads which AI model the user picked for an agent.
 *
 * The ACTING user's model choice for this agent plus its effective
 * `allowedModels` ceiling, or `null` when the gateway does not serve model
 * choices (404) — a non-Teams host — so the composer degrades to single-player
 * behavior. Every other error still throws.
 * @param agentSlugOrId The agent this acts on, by the id or slug listAgents
 *   returns. Read it from listAgents rather than writing the name the user
 *   says.
 * @assistant group:agents
 */
export async function getAgentModelChoice(
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
): Promise<AgentModelChoiceInfo | null> {
  try {
    const res = await cpFetch(
      cfg,
      `/v1/agents/${encodeURIComponent(agentSlugOrId)}/model-choice`,
    );
    return (await res.json()) as AgentModelChoiceInfo;
  } catch (err) {
    if (err instanceof HoustonEngineError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Chooses which AI model an agent uses.
 *
 * Set the ACTING user's model choice for this agent (gateway clamps to ceiling).
 *
 * Confirmed: money. The choice sets the rate every later turn with this agent
 * is billed at.
 * @param agentSlugOrId The agent this acts on, by the id or slug listAgents
 *   returns. Read it from listAgents rather than writing the name the user
 *   says.
 * @param choice Which AI to use: a provider connected here
 *   (listAgentProviders lists them), one of the models this agent is
 *   allowed (getAgentModelChoice returns the allowed set) and optionally
 *   how hard it should think, one of low, medium, high or xhigh.
 * @assistant group:agents confirm
 */
export async function setAgentModelChoice(
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
  choice: AgentModelChoice,
): Promise<void> {
  await cpFetch(
    cfg,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/model-choice`,
    { method: "PUT", body: JSON.stringify(choice) },
  );
}

/**
 * Checks whether an agent's routine triggers are ready.
 *
 * One agent's per-routine trigger status (C9), or `null` when the gateway does
 * not serve triggers (404). Callers treat `null` as "triggers unsupported here"
 * and hide the badge; every other error throws.
 * @param agentSlugOrId The agent this acts on, by the id or slug listAgents
 *   returns. Read it from listAgents rather than writing the name the user
 *   says.
 * @assistant group:routines
 */
export async function agentTriggerStatus(
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
): Promise<TriggerStatusItem[] | null> {
  try {
    const res = await cpFetch(
      cfg,
      `/v1/agents/${encodeURIComponent(agentSlugOrId)}/trigger-status`,
    );
    return ((await res.json()) as { items: TriggerStatusItem[] }).items;
  } catch (err) {
    if (err instanceof HoustonEngineError && err.status === 404) return null;
    throw err;
  }
}
