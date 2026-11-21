import type { WireAgent } from "@houston/sdk";
import type { Agent } from "@houston/wire-types";
import { HoustonEngineError } from "../client/errors";
import { DEFAULT_AGENT_COLOR, DEFAULT_AGENT_CONFIG_ID } from "../synthetic";
import { colorOverlay, moveColor, setColor } from "./agent-color";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

export function toUiAgent(a: WireAgent, colors = colorOverlay()): Agent {
  const iso = new Date(a.createdAt).toISOString();
  return {
    id: a.id,
    name: a.name,
    folderPath: a.id,
    localDir: a.dir,
    configId: DEFAULT_AGENT_CONFIG_ID,
    color: colors[a.id] ?? a.color ?? DEFAULT_AGENT_COLOR,
    role: a.role,
    timezone: a.timezone,
    createdAt: iso,
    lastOpenedAt: iso,
    assigned: a.assigned,
    assignedUserIds: a.assignedUserIds,
    access: a.access,
    assignments: a.assignments,
  };
}

export function createdAgentToUi(agent: WireAgent, color?: string): Agent {
  if (color) setColor(agent.id, color);
  return toUiAgent(agent);
}

export function renamedAgentToUi(previousId: string, agent: WireAgent): Agent {
  moveColor(previousId, agent.id);
  return toUiAgent(agent);
}

/**
 * The app picker's write: set the device overlay (the synchronous copy every
 * render reads, which the account-preference sync mirrors up) and answer with
 * the refreshed agent the caller renders.
 *
 * Withheld from the assistant: its only wire call is the list REFETCH it
 * builds its answer from, so the derived route addresses a read while the
 * write stays client-side. `updateAgentColor`, in the SDK's agents module, is
 * the single-request host leaf that publishes this intent.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param color One of the app's ten palette colours: charcoal, forest,
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
  const found = ((await res.json()) as WireAgent[]).find(
    (a) => a.id === agentId,
  );
  if (!found)
    throw new HoustonEngineError(404, {
      error: { message: "agent not found" },
    });
  return toUiAgent(found);
}
