import type { AgentColorId } from "@houston-ai/core";
import type {
  Agent,
  AgentAccess,
  AgentAssignment,
  InstalledConfig,
} from "../../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "../client/errors";
import { DEFAULT_AGENT_COLOR, DEFAULT_AGENT_CONFIG_ID } from "../synthetic";
import { colorOverlay, moveColor, setColor } from "./agent-color";
import { syncAgentColors } from "./agent-color-sync";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

/** What the control plane returns for an agent (id + name + workspace + ts). */
export interface CpAgent {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: number;
  /** Absolute on-disk directory — present only when the host is co-located
   * with the files (local profile). Feeds the OS reveal/open commands. */
  dir?: string;
  /** Rust-era legacy color the host reads from the agent's
   * `.houston/agent.json` (local profiles only; the gateway omits it). The
   * client overlay — the user's current pick — outranks it; this only fills
   * the gap for colors picked before the engine cutover, which the overlay
   * never held (they lived engine-side). */
  color?: string;
  assigned?: boolean;
  assignedUserIds?: string[];
  /** Teams v2: the caller's effective access to this agent. */
  access?: AgentAccess;
  /** Teams v2: full assignee list with per-person access (managers/owner only). */
  assignments?: AgentAssignment[];
}

/** Exported for unit tests (the color precedence is the load-bearing bit). */
export function toUiAgent(a: CpAgent, colors = colorOverlay()): Agent {
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
    createdAt: iso,
    lastOpenedAt: iso,
    assigned: a.assigned,
    assignedUserIds: a.assignedUserIds,
    access: a.access,
    assignments: a.assignments,
  };
}

/**
 * Lists the user's agents.
 * @assistant group:agents
 */
export async function listAgents(cfg: ControlPlaneConfig): Promise<Agent[]> {
  // Reconcile the color overlay with the `agent_colors` account preference
  // alongside the list fetch (PRODUCT-1344): after a sign-out purge the
  // device overlay is empty, and mapping before the account copy lands would
  // paint every agent default-purple. It also carries colors set elsewhere —
  // another device, or the assistant's `updateAgentColor` — onto this one, so
  // the list refetch an agent change triggers repaints. Never rejects.
  const [res] = await Promise.all([
    cpFetch(cfg, "/agents"),
    syncAgentColors(cfg),
  ]);
  const colors = colorOverlay();
  return ((await res.json()) as CpAgent[]).map((a) => toUiAgent(a, colors));
}

// The agent-picker create/rename/delete WRITES delegate to `sdk.agents.writes.*`
// (byte-identical POST/PATCH/DELETE, no refetch) — see `client/agents-mixin.ts`.
// These pure mappers keep the color overlay colocated with `toUiAgent`: the SDK
// returns the wire agent (incl. its id), and web layers its overlay-only color
// on top.

/** Map a freshly created wire agent to the UI shape, seeding its color overlay
 *  from the picker's choice (overlay-only; color never crosses the wire). */
export function createdAgentToUi(agent: CpAgent, color?: string): Agent {
  if (color) setColor(agent.id, color);
  return toUiAgent(agent);
}

/**
 * Creates a new agent. Always choose a `color` for it, one of Houston's ten
 * palette colors: charcoal, forest, teal, navy, purple, rose, crimson, orange,
 * golden, or umber. It is how the new agent is told apart at a glance, and
 * leaving it out gives every agent the same default color.
 *
 * Create an agent directly over the control plane. The agent-picker path
 * delegates create to the SDK (see the mixin); this stays for the portable
 * install flow (`portable.ts install`), a `cfg`-scoped module function with no
 * SDK handle. Same wire the SDK write issues: `POST /agents` with the seed body
 * (JSON.stringify drops undefined, so a plain create posts just `{ name }`).
 *
 * Confirmed: money. An agent is a billed unit with its own workspace and
 * running engine, so creating one adds recurring cost the user has to want.
 * @param name What to call the new agent, in the user's own words.
 * @param color One of Houston's ten palette colours: charcoal, forest,
 *   teal, navy, purple, rose, crimson, orange, golden or umber.
 * @param seed Optional starting files for the new agent. Omit it for a
 *   blank one.
 * @assistant group:agents confirm
 * @assistant unschematized: the seed's seeds map is an open record of file path to contents.
 */
export async function createAgent(
  cfg: ControlPlaneConfig,
  name: string,
  color?: AgentColorId,
  seed?: {
    claudeMd?: string;
    seeds?: Record<string, string>;
  },
): Promise<Agent> {
  const res = await cpFetch(cfg, "/agents", {
    method: "POST",
    body: JSON.stringify({
      name,
      color,
      claudeMd: seed?.claudeMd,
      seeds: seed?.seeds,
    }),
  });
  return createdAgentToUi((await res.json()) as CpAgent, color);
}

/** Map a renamed wire agent to the UI shape. The local store derives an agent's
 *  id from its on-disk path, so a rename changes the id — carry the color
 *  overlay across to the new id or the avatar reverts to the default color. */
export function renamedAgentToUi(previousId: string, agent: CpAgent): Agent {
  moveColor(previousId, agent.id);
  return toUiAgent(agent);
}

// Agent-config library: user-scoped like the marketplace reads — a template
// belongs to the account, not to any existing agent.
/**
 * Lists the agent templates installed in Houston.
 * @assistant group:agents
 * @assistant unschematized: an installed template carries its raw config document, whose shape is the template's own.
 */
export async function listInstalledConfigs(
  cfg: ControlPlaneConfig,
): Promise<InstalledConfig[]> {
  try {
    const res = await cpFetch(cfg, "/v1/agent-configs");
    return (await res.json()) as InstalledConfig[];
  } catch (err) {
    // The hosted gateway keeps no account-level config library (one pod per
    // agent, no shared disk) and answers 404 for the route — the same honest
    // answer as standalone web: nothing installed, the picker shows the
    // bundled templates (HOU-688). Every other failure still propagates.
    if (err instanceof HoustonEngineError && err.status === 404) return [];
    throw err;
  }
}
/**
 * Installs an agent from a GitHub repository.
 * @param githubUrl The full https address of the GitHub repository to
 *   install the agent from.
 * @assistant group:agents confirm
 */
export async function installAgentFromGithub(
  cfg: ControlPlaneConfig,
  githubUrl: string,
): Promise<{ agentId: string }> {
  const res = await cpFetch(cfg, "/v1/agents/install-from-github", {
    method: "POST",
    body: JSON.stringify({ githubUrl }),
  });
  return (await res.json()) as { agentId: string };
}
