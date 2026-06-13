import type { IncomingMessage, ServerResponse } from "node:http";
import { seedSchemas } from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";
import type { Agent, UserId, Workspace, WorkspaceRuntime } from "../domain/types";
import type { RuntimeChannel, WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import type { EventHub } from "../events/hub";
import { CloudPaths, type WorkspacePaths } from "../paths";
import { canUseAgent } from "../domain/access";
import { handleAgentData } from "./agent-data";
import { handleSkills } from "./skills";
import { json, readJson } from "./http";

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
}

const DEFAULT_PATHS = new CloudPaths();

type AgentAuthz =
  | { ok: true; agent: Agent; workspace: Workspace }
  | { ok: false; status: number; reason: string };

/** Load an agent + its workspace and run the ownership check in one place. */
async function authorizeAgent(deps: AgentRouteDeps, userId: UserId, agentId: string): Promise<AgentAuthz> {
  const agent = await deps.store.getAgent(agentId);
  const workspace = agent ? await deps.store.getWorkspace(agent.workspaceId) : null;
  const access = canUseAgent({ userId, agent, workspace });
  if (!access.ok) {
    return { ok: false, status: access.reason === "agent not found" ? 404 : 403, reason: access.reason };
  }
  if (!agent || !workspace) return { ok: false, status: 404, reason: "agent not found" }; // narrows the type
  return { ok: true, agent, workspace };
}

/** The workspace's channel, or null (route answers 503 — hosting model not wired). */
function channelFor(deps: AgentRouteDeps, workspace: Workspace): RuntimeChannel | null {
  return deps.channels[workspace.runtime] ?? null;
}

const noChannel = (res: ServerResponse, runtime: WorkspaceRuntime) =>
  json(res, 503, { error: `${runtime} runtime not configured` });

/**
 * The user's agents: list/create/rename/delete, connect-once capture, and the
 * per-agent runtime dispatch (chat, SSE, providers, settings, files) — all
 * behind one ownership check, all hosting-model-agnostic via RuntimeChannel.
 * Returns true when the request was handled.
 */
export async function handleAgents(
  deps: AgentRouteDeps,
  userId: UserId,
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  // The user's own agents — their personal workspace, auto-provisioned on first hit.
  if (path === "/agents" && method === "GET") {
    const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
    json(res, 200, await deps.store.listAgents(ws.id));
    return true;
  }
  if (path === "/agents" && method === "POST") {
    const { name } = await readJson(req);
    if (!name || typeof name !== "string") {
      json(res, 400, { error: "missing 'name'" });
      return true;
    }
    const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
    const agent = await deps.store.createAgent({ workspaceId: ws.id, name });
    // Seed the .houston JSON schemas beside the (future) docs so the agent and
    // external tools can validate what they write. Skipped only when no vfs is
    // wired (legacy gke-only deploys); the typed-data routes 503 there anyway.
    if (deps.vfs) await seedSchemas(deps.vfs, (deps.paths ?? DEFAULT_PATHS).agentRoot(ws, agent));
    deps.events?.emit(ws.ownerUserId, { type: "AgentsChanged", workspaceId: ws.id });
    json(res, 201, agent);
    return true;
  }

  // Rename / delete a single agent (owner-only — in personal mode, everyone for their own).
  const single = path.match(/^\/agents\/([^/]+)$/);
  if (single && (method === "PATCH" || method === "DELETE")) {
    const agentId = single[1];
    if (!agentId) {
      json(res, 404, { error: "not found" });
      return true;
    }
    const authz = await authorizeAgent(deps, userId, agentId);
    if (!authz.ok) {
      json(res, authz.status, { error: authz.reason });
      return true;
    }

    if (method === "PATCH") {
      const { name } = await readJson(req);
      if (!name || typeof name !== "string") {
        json(res, 400, { error: "missing 'name'" });
        return true;
      }
      const renamed = await deps.store.renameAgent(agentId, name);
      deps.events?.emit(authz.workspace.ownerUserId, { type: "AgentsChanged", workspaceId: authz.workspace.id });
      json(res, 200, renamed);
      return true;
    }

    // DELETE: tear the agent's runtime-side state down first (so a failure is
    // retryable with the record intact), then drop the record. Errors surface —
    // never a silent orphan.
    const channel = channelFor(deps, authz.workspace);
    if (!channel) {
      noChannel(res, authz.workspace.runtime);
      return true;
    }
    await channel.teardown({ workspace: authz.workspace, agent: authz.agent });
    await deps.store.deleteAgent(agentId);
    deps.events?.emit(authz.workspace.ownerUserId, { type: "AgentsChanged", workspaceId: authz.workspace.id });
    json(res, 200, { ok: true });
    return true;
  }

  // Capture (connect-once): after the user connects an agent's subscription,
  // persist the credential for the WHOLE workspace so every agent (existing +
  // new) serves from it. Must precede the generic dispatch.
  const capture = path.match(/^\/agents\/([^/]+)\/credential\/capture$/);
  if (capture && method === "POST") {
    const agentId = capture[1];
    if (!agentId) {
      json(res, 404, { error: "not found" });
      return true;
    }
    const authz = await authorizeAgent(deps, userId, agentId);
    if (!authz.ok) {
      json(res, authz.status, { error: authz.reason });
      return true;
    }
    const channel = channelFor(deps, authz.workspace);
    if (!channel) {
      noChannel(res, authz.workspace.runtime);
      return true;
    }
    const result = await channel.captureCredential({ workspace: authz.workspace, agent: authz.agent });
    if (result.ok) json(res, 200, { ok: true, provider: result.provider });
    else json(res, result.status, { error: result.error, ...(result.detail ? { detail: result.detail } : {}) });
    return true;
  }

  // The per-agent runtime surface: /agents/:agentId/<anything> → the agent's
  // runtime, via the workspace's channel. The frontend points its runtime
  // client at `${controlPlaneUrl}/agents/${agentId}`, so chat turns, the SSE
  // event stream, and the provider connect flow all reach the runtime under
  // one ownership-checked dispatch.
  const dispatch = path.match(/^\/agents\/([^/]+)\/(.+)$/);
  if (dispatch) {
    const agentId = dispatch[1];
    const rest = dispatch[2];
    if (!agentId || !rest) {
      json(res, 404, { error: "not found" });
      return true;
    }
    const authz = await authorizeAgent(deps, userId, agentId);
    if (!authz.ok) {
      json(res, authz.status, { error: authz.reason });
      return true;
    }
    const ctx = { workspace: authz.workspace, agent: authz.agent };
    // Reactivity emits target the workspace owner (the only member, personal tier).
    const emit = deps.events
      ? (event: HoustonEvent) => deps.events!.emit(authz.workspace.ownerUserId, event)
      : undefined;

    // Typed .houston families + skills are served by the HOST off the workspace
    // vfs — the runtime surface (chat, auth, settings, files) goes to the channel.
    const paths = deps.paths ?? DEFAULT_PATHS;
    if (await handleAgentData(deps.vfs, paths, ctx, method, rest, req, res, emit)) return true;
    if (await handleSkills(deps.vfs, paths, ctx, method, rest, req, res, emit)) return true;

    const channel = channelFor(deps, authz.workspace);
    if (!channel) {
      noChannel(res, authz.workspace.runtime);
      return true;
    }
    await channel.dispatch(ctx, method, rest, url, req, res);
    return true;
  }

  return false;
}
