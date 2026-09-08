import type { AgentColorId } from "@houston-ai/core";
import type { Agent } from "../../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "../client/errors";
import { setColor } from "./agent-color";
import { type CpAgent, toUiAgent } from "./agents";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * The two ways an agent's color is written: the app's picker and the host-side
 * leaf the personal assistant dispatches. Both land in the SAME durable store —
 * the account-wide `agent_colors` preference (`./agent-color-sync`) — so a
 * color set by the assistant is the color the app renders, and vice versa.
 */

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
 * @assistant group:agents
 */
export async function updateAgentColor(
  cfg: ControlPlaneConfig,
  agentId: string,
  color: AgentColorId,
): Promise<void> {
  await cpFetch(cfg, `/v1/agents/${encodeURIComponent(agentId)}/color`, {
    method: "PUT",
    body: JSON.stringify({ color }),
  });
}

/**
 * The app picker's write: set the device overlay (the synchronous copy every
 * render reads, which the account-preference sync mirrors up) and answer with
 * the refreshed agent the caller renders.
 *
 * Withheld from the assistant: its only wire call is the list REFETCH it
 * builds its answer from, so the derived route addresses a read while the
 * write stays client-side. {@link updateAgentColor} is the single-request host
 * leaf that publishes this intent.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param color One of Houston's ten palette colours: charcoal, forest,
 *   teal, navy, purple, rose, crimson, orange, golden or umber.
 * @assistant group:agents hidden: client-side branching; its only request is the list refetch, so use updateAgentColor to write a color.
 */
export async function applyAgentColor(
  cfg: ControlPlaneConfig,
  agentId: string,
  color: string,
): Promise<Agent> {
  setColor(agentId, color);
  const res = await cpFetch(cfg, "/agents");
  const found = ((await res.json()) as CpAgent[]).find((a) => a.id === agentId);
  if (!found)
    throw new HoustonEngineError(404, {
      error: { message: "agent not found" },
    });
  return toUiAgent(found);
}
