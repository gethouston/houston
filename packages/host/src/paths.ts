import type { Agent, Workspace } from "./domain/types";

/**
 * Where an agent's files live in the Vfs — the ONE seam where the cloud and
 * local on-disk layouts differ, so the shared route handlers stay layout-blind.
 *
 *   Cloud (GCS prefixes, synthetic ids):
 *     prefix    ws/<wsId>/<agentId>
 *     agentRoot ws/<wsId>/<agentId>/workspace   (.houston + the agent's files)
 *     dataRoot  ws/<wsId>/<agentId>/data        (conversations, settings, auth)
 *
 *   Local (the existing desktop tree, human names, no workspace/+data/ split):
 *     prefix    <Workspace>/<Agent>
 *     agentRoot <Workspace>/<Agent>             (.houston directly under the dir)
 *     dataRoot  <Workspace>/<Agent>/.houston/runtime
 *
 * The local layout preserves what desktop users already have on disk
 * (don't-break-user-data) at the cost of this one small, contract-tested seam.
 */
export interface WorkspacePaths {
  /** The agent's whole subtree (for teardown / deletePrefix). */
  agentPrefix(ws: Workspace, agent: Agent): string;
  /** HOUSTON_WORKSPACE_DIR — `.houston` + the agent's working files. */
  agentRoot(ws: Workspace, agent: Agent): string;
  /** HOUSTON_DATA_DIR — conversations, settings.json, auth.json. */
  dataRoot(ws: Workspace, agent: Agent): string;
}

export function conversationKey(
  paths: WorkspacePaths,
  ws: Workspace,
  agent: Agent,
  cid: string,
): string {
  return `${paths.dataRoot(ws, agent)}/conversations/${encodeURIComponent(cid)}.json`;
}

export function settingsKey(
  paths: WorkspacePaths,
  ws: Workspace,
  agent: Agent,
): string {
  return `${paths.dataRoot(ws, agent)}/settings.json`;
}

/** Cloud layout — reproduces today's GCS-prefix keys exactly (pinned by a contract test). */
export class CloudPaths implements WorkspacePaths {
  agentPrefix(ws: Workspace, agent: Agent): string {
    return `ws/${ws.id}/${agent.id}`;
  }
  agentRoot(ws: Workspace, agent: Agent): string {
    return `${this.agentPrefix(ws, agent)}/workspace`;
  }
  dataRoot(ws: Workspace, agent: Agent): string {
    return `${this.agentPrefix(ws, agent)}/data`;
  }
}

/**
 * Local layout — the desktop tree under the FsVfs root (`~/.houston/workspaces`).
 * The agent's id IS its `<Workspace>/<Agent>` path (the local store assigns it
 * that way), so the keys map 1:1 to the user's existing directories and the
 * same id flows through events + the FsWatcher unchanged. The id carries a
 * slash, so URL transport encodes it and the server decodes it back (a no-op
 * for cloud uuids).
 */
export class LocalPaths implements WorkspacePaths {
  agentPrefix(_ws: Workspace, agent: Agent): string {
    return agent.id;
  }
  agentRoot(_ws: Workspace, agent: Agent): string {
    return agent.id;
  }
  dataRoot(_ws: Workspace, agent: Agent): string {
    return `${agent.id}/.houston/runtime`;
  }
}

const CLOUD = new CloudPaths();

/** Cloud-layout agent root — a convenience for cloud tests + callers without a paths instance. */
export const workspaceRoot = (ws: Workspace, agent: Agent) =>
  CLOUD.agentRoot(ws, agent);
