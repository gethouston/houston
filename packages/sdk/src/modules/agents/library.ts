/**
 * The account-scoped agent routes: the template library the create-agent picker
 * merges alongside the bundled templates, and the colour leaf that writes one
 * agent's palette pick.
 *
 * Kept out of `index.ts` so the module factory there stays within the file-size
 * budget, and out of `http.ts` because these are `/v1` account routes rather
 * than the agent-list CRUD — they share only the transport scope
 * (`agentsScope`), so a failure here is the same `AgentsHttpError` and a 401
 * reaches the same auth-expiry signal.
 *
 * Nothing degrades here: a 404 on the library route means "this deployment
 * keeps no account-level library", which is a disposition only the calling
 * surface can read (the hosted gateway runs one pod per agent and has no shared
 * disk). The SDK reports the status and the surface decides.
 */

import { AGENT_COLOR_IDS, type AgentColorId } from "@houston/domain";
import type { ModuleContext } from "../../module-context";
import { type HttpScope, httpRequest } from "../http";
import { requireString } from "../payload";
import { AgentsCommand, type InstalledConfig } from "./types";

// Agent-config library: user-scoped like the marketplace reads — a template
// belongs to the account, not to any existing agent.
/**
 * Lists the agent templates installed in Houston.
 * @assistant group:agents
 * @assistant unschematized: an installed template carries its raw config document, whose shape is the template's own.
 */
export async function listInstalledConfigs(
  scope: HttpScope,
): Promise<InstalledConfig[]> {
  const res = await httpRequest(scope, "/v1/agent-configs");
  return (await res.json()) as InstalledConfig[];
}

/**
 * Installs an agent from a GitHub repository.
 * @param githubUrl The full https address of the GitHub repository to
 *   install the agent from.
 * @assistant group:agents confirm
 */
export async function installAgentFromGithub(
  scope: HttpScope,
  githubUrl: string,
): Promise<{ agentId: string }> {
  const res = await httpRequest(scope, "/v1/agents/install-from-github", {
    method: "POST",
    body: JSON.stringify({ githubUrl }),
  });
  return (await res.json()) as { agentId: string };
}

/**
 * Change an agent's color. Pick one of Houston's ten palette colors: charcoal,
 * forest, teal, navy, purple, rose, crimson, orange, golden, or umber. The new
 * color shows up everywhere that agent appears.
 *
 * The host merges the pick into the account's `agent_colors` preference and
 * announces the change, so every open surface repaints without a refresh.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param color One of Houston's ten palette colours: charcoal, forest,
 *   teal, navy, purple, rose, crimson, orange, golden or umber.
 * @assistant group:agents unconfirmed: Reversible display preference; changes no agent behavior or access.
 */
export async function updateAgentColor(
  scope: HttpScope,
  agentId: string,
  color: AgentColorId,
): Promise<void> {
  await httpRequest(scope, `/v1/agents/${encodeURIComponent(agentId)}/color`, {
    method: "PUT",
    body: JSON.stringify({ color }),
  });
}

/** The account's library of installed agent templates. */
export interface AgentsLibrary {
  /** Every template installed into the account. */
  list(): Promise<InstalledConfig[]>;
  /** Install one from a GitHub repository; answers the new agent's id. */
  installFromGithub(githubUrl: string): Promise<{ agentId: string }>;
}

/** The account-scoped half of the agents facade. */
export interface AgentsAccount {
  library: AgentsLibrary;
  /** Set one agent's palette colour, in a single request. */
  setColor(agentId: string, color: AgentColorId): Promise<void>;
}

/** The palette id `value` names, or a throw — a command payload is untrusted,
 *  and the host rejects an unknown colour rather than clamping it. */
function requireColor(payload: unknown, key: string): AgentColorId {
  const value = requireString(payload, key);
  if (!(AGENT_COLOR_IDS as readonly string[]).includes(value))
    throw new Error(`'${key}' is not one of ${AGENT_COLOR_IDS.join(", ")}`);
  return value as AgentColorId;
}

export function createAgentsAccount(
  ctx: ModuleContext,
  scope: HttpScope,
): AgentsAccount {
  const setColor = (agentId: string, color: AgentColorId) =>
    updateAgentColor(scope, agentId, color);
  const installFromGithub = (githubUrl: string) =>
    installAgentFromGithub(scope, githubUrl);

  ctx.registerCommand(AgentsCommand.SetColor, (p) =>
    setColor(requireString(p, "agentId"), requireColor(p, "color")),
  );
  ctx.registerCommand(AgentsCommand.InstallFromGithub, (p) =>
    installFromGithub(requireString(p, "githubUrl")),
  );

  return {
    library: { list: () => listInstalledConfigs(scope), installFromGithub },
    setColor,
  };
}
