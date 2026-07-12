import type {
  AgentAssignment,
  AgentModelChoice,
  AgentModelChoiceInfo,
  AgentSettings,
  TriggerStatusItem,
} from "../../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "../client/errors";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

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
 * The ACTING user's model choice for this agent plus its effective
 * `allowedModels` ceiling, or `null` when the gateway does not serve model
 * choices (404) — a non-Teams host — so the composer degrades to single-player
 * behavior. Every other error still throws.
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

/** Set the ACTING user's model choice for this agent (gateway clamps to ceiling). */
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
 * The integration toolkit slugs granted to this agent, or `null` when the host
 * does not serve grants (404) — a deployment without per-agent grants (e.g. a
 * managed cloud pod whose gateway owns the policy). Callers treat `null` as
 * "grants unsupported here" and degrade silently; every other error still throws.
 */
export async function agentIntegrationGrants(
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
): Promise<string[] | null> {
  try {
    const res = await cpFetch(
      cfg,
      `/v1/agents/${encodeURIComponent(agentSlugOrId)}/integration-grants`,
    );
    return ((await res.json()) as { toolkits: string[] }).toolkits;
  } catch (err) {
    if (err instanceof HoustonEngineError && err.status === 404) return null;
    throw err;
  }
}

/**
 * One agent's per-routine trigger status (C9), or `null` when the gateway does
 * not serve triggers (404). Callers treat `null` as "triggers unsupported here"
 * and hide the badge; every other error throws. Mirrors `agentIntegrationGrants`.
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
