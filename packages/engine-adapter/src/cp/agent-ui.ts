import type { WireAgent } from "@houston/sdk";
import type { Agent } from "@houston/wire-types";
import { HoustonEngineError } from "../client/errors";
import { DEFAULT_AGENT_COLOR, DEFAULT_AGENT_CONFIG_ID } from "../synthetic";
import { colorOverlay, moveColor, setColor } from "./agent-color";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * The wire agent as the app renders it: the browser-local colour overlay
 * (`./agent-color`) layered onto the agent record `@houston/sdk` reads from the
 * host, plus the picker's own colour write.
 *
 * All of it is client-side branching the SDK deliberately does not do — colour
 * is a device pick mirrored up to the account's `agent_colors` preference
 * (`./agent-color-sync`), not a field the agent routes carry. The single-request
 * host leaf that writes a colour is `updateAgentColor` in the SDK's agents
 * module; both land in the SAME durable store, so a colour set by the assistant
 * is the colour the app renders, and vice versa.
 */

/** Exported for unit tests (the color precedence is the load-bearing bit). */
export function toUiAgent(a: WireAgent, colors = colorOverlay()): Agent {
  const iso = new Date(a.createdAt).toISOString();
  return {
    id: a.id,
    name: a.name,
    folderPath: a.id, // the agent id IS the chat route key: /agents/${id}/conversations/...
    // The REAL directory (local hosts only) — what OS reveal/open needs, since
    // folderPath here is a route key, not a path (HOU-677).
    localDir: a.dir,
    configId: DEFAULT_AGENT_CONFIG_ID,
    // Overlay (the user's current pick) → the host's legacy Rust-era color
    // (`.houston/agent.json`) → the default. Before the wire fallback every
    // pre-cutover color rendered as the default purple: the Rust engine stored
    // colors server-side, so the overlay never held them (the reported
    // everything-turned-purple migration bug).
    color: colors[a.id] ?? a.color ?? DEFAULT_AGENT_COLOR,
    role: a.role,
    createdAt: iso,
    lastOpenedAt: iso,
    assigned: a.assigned,
    assignedUserIds: a.assignedUserIds,
    access: a.access,
    assignments: a.assignments,
  };
}

/** Map a freshly created wire agent to the UI shape, seeding its color overlay
 *  from the picker's choice (overlay-only; color never crosses the wire). */
export function createdAgentToUi(agent: WireAgent, color?: string): Agent {
  if (color) setColor(agent.id, color);
  return toUiAgent(agent);
}

/** Map a renamed wire agent to the UI shape. The local store derives an agent's
 *  id from its on-disk path, so a rename changes the id — carry the color
 *  overlay across to the new id or the avatar reverts to the default color. */
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
  const found = ((await res.json()) as WireAgent[]).find(
    (a) => a.id === agentId,
  );
  if (!found)
    throw new HoustonEngineError(404, {
      error: { message: "agent not found" },
    });
  return toUiAgent(found);
}
