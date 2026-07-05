import type { ServerResponse } from "node:http";
import type { Capabilities } from "@houston/protocol";
import { canUseAgent } from "../domain/access";
import type {
  Agent,
  UserId,
  Workspace,
  WorkspaceRuntime,
} from "../domain/types";
import type { EventHub } from "../events/hub";
import { CloudPaths, type WorkspacePaths } from "../paths";
import type { RuntimeChannel, WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { json } from "./http";

/**
 * Shared plumbing for the per-agent route families (routes/agents.ts,
 * routes/routine-runs.ts): the dependency bag, the one-place ownership check,
 * and the workspace→channel lookup.
 */

export interface AgentRouteDeps {
  store: WorkspaceStore;
  /** RuntimeChannel per workspace hosting model; a missing entry answers 503. */
  channels: Partial<Record<WorkspaceRuntime, RuntimeChannel>>;
  /** Workspace file store backing the typed .houston families; absent → those routes 503. */
  vfs?: Vfs;
  /** Where agent files live in the vfs (cloud prefixes vs local tree). Default: cloud. */
  paths?: WorkspacePaths;
  /** Global reactivity fan-out; absent → mutations succeed but emit nothing. */
  events?: EventHub;
  /** Deployment capabilities; gates local-only routes (OpenAI-compatible connect). */
  capabilities?: Capabilities;
  /**
   * The agent's absolute on-disk directory, when this deployment is co-located
   * with the files (local profile). Serialized as `dir` on agent payloads so
   * the desktop shell can reveal/open the folder in the OS file manager — the
   * agent id is a route key, not a path (HOU-677). Cloud deployments omit it.
   */
  agentDir?: (ws: Workspace, agent: Agent) => string;
}

export const DEFAULT_PATHS = new CloudPaths();

export type AgentAuthz =
  | { ok: true; agent: Agent; workspace: Workspace }
  | { ok: false; status: number; reason: string };

/** Load an agent + its workspace and run the ownership check in one place. */
export async function authorizeAgent(
  deps: AgentRouteDeps,
  userId: UserId,
  agentId: string,
): Promise<AgentAuthz> {
  const agent = await deps.store.getAgent(agentId);
  const workspace = agent
    ? await deps.store.getWorkspace(agent.workspaceId)
    : null;
  const access = canUseAgent({ userId, agent, workspace });
  if (!access.ok) {
    return {
      ok: false,
      status: access.reason === "agent not found" ? 404 : 403,
      reason: access.reason,
    };
  }
  if (!agent || !workspace)
    return { ok: false, status: 404, reason: "agent not found" }; // narrows the type
  return { ok: true, agent, workspace };
}

/** The workspace's channel, or null (route answers 503 — hosting model not wired). */
export function channelFor(
  deps: AgentRouteDeps,
  workspace: Workspace,
): RuntimeChannel | null {
  return deps.channels[workspace.runtime] ?? null;
}

export const noChannel = (res: ServerResponse, runtime: WorkspaceRuntime) =>
  json(res, 503, { error: `${runtime} runtime not configured` });
