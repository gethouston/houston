/**
 * First-run setup: ensure a SmartBooks workspace and Bookkeeper agent
 * exist, seed the scripts + CLAUDE.md, persist the resolved paths.
 *
 * Idempotent — safe to call on every launch. If the workspace/agent
 * already exist we reuse them.
 */

import type { HoustonClient } from "@houston-ai/engine-client";
import type { AgentConfig } from "./config";
import { loadAgentConfig, saveAgentConfig } from "./config";
import { CLAUDE_MD, SEEDS } from "./seed";

const WORKSPACE_NAME = "SmartBooks";
const AGENT_NAME = "Bookkeeper";

export async function ensureAgent(client: HoustonClient): Promise<AgentConfig> {
  // Fast path — previously-resolved agent still valid?
  const cached = loadAgentConfig();
  if (cached) {
    try {
      const agents = await client.listAgents(cached.workspaceId);
      if (agents.some((a) => a.folderPath === cached.agentPath)) {
        return cached;
      }
    } catch {
      /* engine was reset — fall through to re-create */
    }
  }

  // Find or create workspace.
  const existing = await client.listWorkspaces();
  let workspace = existing.find((w) => w.name === WORKSPACE_NAME);
  if (!workspace) {
    workspace = await client.createWorkspace({ name: WORKSPACE_NAME });
  }

  // Find or create agent.
  const agents = await client.listAgents(workspace.id);
  let agent = agents.find((a) => a.name === AGENT_NAME);
  if (!agent) {
    const created = await client.createAgent(workspace.id, {
      name: AGENT_NAME,
      configId: "blank",
      claudeMd: CLAUDE_MD,
      seeds: SEEDS,
    });
    agent = created.agent;
  }

  const cfg: AgentConfig = {
    workspaceId: workspace.id,
    agentPath: agent.folderPath,
    // One rolling session for the whole demo — keeps chat history in one
    // place. Real products would use a separate key per conversation.
    sessionKey: cached?.sessionKey ?? `smartbooks-${crypto.randomUUID()}`,
  };
  saveAgentConfig(cfg);

  // CRITICAL: when the Claude CLI writes a file via its own Write/Edit
  // tools, it bypasses the engine's write routes — the engine only
  // learns about those changes through the filesystem watcher. Without
  // this call, `FilesChanged` never fires for agent-side writes and the
  // UI appears frozen until a manual refresh. The engine holds ONE
  // active watcher per process and will swap to this agent's folder.
  try {
    await client.startAgentWatcher(cfg.agentPath);
  } catch (err) {
    console.warn("[smartbooks] failed to start agent watcher", err);
  }

  return cfg;
}
