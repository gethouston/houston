import type {
  Agent,
  CreateAgent,
} from "../../../../ui/engine-client/src/types";
import { DEFAULT_AGENT_COLOR, syntheticAgent } from "./synthetic";
import { writeAgentFile } from "./agent-files";

/**
 * localStorage-backed agent registry.
 *
 * The new TS engine is single-user with no agent concept, so the desktop UI's
 * agents are persisted client-side (one bucket per synthetic workspace). One
 * default "Houston" agent is seeded on first access so the shell has a usable
 * agent immediately; the user can create / rename / recolor / delete more. Each
 * agent gets its own `folderPath`, which namespaces its board, config, and chats
 * (chat conversations key off the per-mission `session_key`).
 */
const KEY = "houston.web.agents";

type Store = Record<string, Agent[]>;

function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Store;
  } catch {
    return {};
  }
}

function save(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage disabled */
  }
}

/** Agents for a workspace, seeding the default Houston agent on first access. */
function seeded(store: Store, workspaceId: string): Agent[] {
  let agents = store[workspaceId];
  if (!agents) {
    agents = [syntheticAgent()];
    store[workspaceId] = agents;
    save(store);
  }
  return agents;
}

export function listAgents(workspaceId: string): Agent[] {
  return seeded(load(), workspaceId);
}

/** Resolve an agent's display name from its `folderPath` (for conversation rows). */
export function agentNameByPath(agentPath: string): string | undefined {
  for (const agents of Object.values(load())) {
    const found = agents.find((a) => a.folderPath === agentPath);
    if (found) return found.name;
  }
  return undefined;
}

export function createAgent(
  workspaceId: string,
  req: CreateAgent,
): { agent: Agent } {
  const id = crypto.randomUUID();
  const at = new Date().toISOString();
  const agent: Agent = {
    id,
    name: req.name,
    folderPath: `houston:${id}`,
    configId: req.configId,
    color: req.color ?? DEFAULT_AGENT_COLOR,
    createdAt: at,
    lastOpenedAt: at,
  };
  const store = load();
  const agents = seeded(store, workspaceId);
  agents.push(agent);
  save(store);
  // Seed the agent's instructions + any template files, like the real engine
  // does on create — otherwise AI-generated instructions (the AI-assist flow)
  // would be silently dropped.
  if (req.claudeMd) writeAgentFile(agent.folderPath, "CLAUDE.md", req.claudeMd);
  for (const [relPath, content] of Object.entries(req.seeds ?? {})) {
    writeAgentFile(agent.folderPath, relPath, content);
  }
  return { agent };
}

export function renameAgent(
  workspaceId: string,
  agentId: string,
  newName: string,
): Agent {
  return mutate(workspaceId, agentId, (a) => ({ ...a, name: newName }));
}

export function updateAgentColor(
  workspaceId: string,
  agentId: string,
  color: string,
): Agent {
  return mutate(workspaceId, agentId, (a) => ({ ...a, color }));
}

export function deleteAgent(workspaceId: string, agentId: string): void {
  const store = load();
  store[workspaceId] = seeded(store, workspaceId).filter(
    (a) => a.id !== agentId,
  );
  save(store);
}

function mutate(
  workspaceId: string,
  agentId: string,
  fn: (a: Agent) => Agent,
): Agent {
  const store = load();
  const agents = seeded(store, workspaceId);
  const idx = agents.findIndex((a) => a.id === agentId);
  if (idx < 0) throw new Error(`agent ${agentId} not found`);
  const next = fn(agents[idx]);
  agents[idx] = next;
  save(store);
  return next;
}
