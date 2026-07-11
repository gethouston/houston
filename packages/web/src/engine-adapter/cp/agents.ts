import type {
  Agent,
  AgentAccess,
  AgentAssignment,
  InstalledConfig,
} from "../../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "../client/errors";
import { DEFAULT_AGENT_COLOR, DEFAULT_AGENT_CONFIG_ID } from "../synthetic";
import { colorOverlay, moveColor, setColor } from "./agent-color";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

/** What the control plane returns for an agent (id + name + workspace + ts). */
interface CpAgent {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: number;
  /** Absolute on-disk directory — present only when the host is co-located
   * with the files (local profile). Feeds the OS reveal/open commands. */
  dir?: string;
  assigned?: boolean;
  assignedUserIds?: string[];
  /** Teams v2: the caller's effective access to this agent. */
  access?: AgentAccess;
  /** Teams v2: full assignee list with per-person access (managers/owner only). */
  assignments?: AgentAssignment[];
}

function toUiAgent(a: CpAgent, colors = colorOverlay()): Agent {
  const iso = new Date(a.createdAt).toISOString();
  return {
    id: a.id,
    name: a.name,
    folderPath: a.id, // the agent id IS the chat route key: /agents/${id}/conversations/...
    // The REAL directory (local hosts only) — what OS reveal/open needs, since
    // folderPath here is a route key, not a path (HOU-677).
    localDir: a.dir,
    configId: DEFAULT_AGENT_CONFIG_ID,
    color: colors[a.id] ?? DEFAULT_AGENT_COLOR,
    createdAt: iso,
    lastOpenedAt: iso,
    assigned: a.assigned,
    assignedUserIds: a.assignedUserIds,
    access: a.access,
    assignments: a.assignments,
  };
}

export async function listAgents(cfg: ControlPlaneConfig): Promise<Agent[]> {
  const res = await cpFetch(cfg, "/agents");
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
 * Create an agent directly over the control plane. The agent-picker path
 * delegates create to the SDK (see the mixin); this stays for the portable
 * install flow (`portable.ts install`), a `cfg`-scoped module function with no
 * SDK handle. Same wire the SDK write issues: `POST /agents` with the seed body
 * (JSON.stringify drops undefined, so a plain create posts just `{ name }`).
 */
export async function createAgent(
  cfg: ControlPlaneConfig,
  name: string,
  color?: string,
  seed?: {
    claudeMd?: string;
    seeds?: Record<string, string>;
  },
): Promise<Agent> {
  const res = await cpFetch(cfg, "/agents", {
    method: "POST",
    body: JSON.stringify({
      name,
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

/** Color is overlay-only; the server agent is unchanged. Returns the updated view. */
export async function updateAgentColor(
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

// Agent-config library: user-scoped like the marketplace reads — a template
// belongs to the account, not to any existing agent.
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
