import type { ServerResponse } from "node:http";
import type { Capabilities } from "@houston/protocol";
import type { SharedEndpointStore } from "../credentials/remote-shared-endpoint-store";
import { canUseAgent } from "../domain/access";
import type {
  Agent,
  UserId,
  Workspace,
  WorkspaceRuntime,
} from "../domain/types";
import type { EventHub } from "../events/hub";
import type { LocalActionApprovals } from "../integrations/action-approvals";
import type { CustomIntegrationManager } from "../integrations/custom/manager";
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
  /** Managed gateway store for the active organization's shared local endpoint. */
  sharedEndpoints?: SharedEndpointStore;
  /**
   * The agent's absolute on-disk directory, when this deployment is co-located
   * with the files (local profile). Serialized as `dir` on agent payloads so
   * the desktop shell can reveal/open the folder in the OS file manager — the
   * agent id is a route key, not a path (HOU-677). Cloud deployments omit it.
   */
  agentDir?: (ws: Workspace, agent: Agent) => string;
  /**
   * True only when a trusted gateway fronts EVERY request (the managed cloud
   * pod) — mirrors ControlPlaneDeps.gatewayFronted. Routine writes then take
   * their recorded identity from the gateway-minted acting-as header instead
   * of this host's single local user id.
   */
  gatewayFronted?: boolean;
  /**
   * True when this deployment's egress can reach loopback/private addresses
   * even though it is gateway-fronted. Only the DEV LAUNCHER sets it: its
   * "pods" are processes on the developer's machine, so the managed-cloud
   * public-HTTPS-:443 endpoint validation would enforce a NetworkPolicy that
   * does not exist there — and block connecting a local model in `pnpm dev`
   * entirely. Real managed pods never set this; the validation models their
   * actual egress.
   */
  loopbackEgress?: boolean;
  /**
   * How many /agents/* requests this server currently holds open, the asking
   * /activity probe included (server.ts counts them; the reader subtracts
   * itself). Long-lived per-agent SSE streams — a turn reply, a conversation
   * events subscription — stay counted for their whole life, which is the
   * point: an open stream means someone is watching, and the gateway's idle
   * sweep must not sleep the pod under them. Deliberately scoped to /agents/*:
   * the top-level /v1/events is held by the gateway's reactivity fan-in for
   * EVERY awake pod whenever the app is open anywhere, and counting it would
   * defeat idle-sleep wholesale.
   */
  agentRequestCount?: () => number;
  /**
   * Per-agent action approvals (mirrors ControlPlaneDeps.actionApprovals) —
   * the dispatch-surface routes (`/agents/:id/action-approvals/*`) write here.
   * Absent → those requests fall through toward the runtime channel (404).
   */
  actionApprovals?: LocalActionApprovals;
  /**
   * Custom-integration manager (mirrors ControlPlaneDeps.customIntegrations) —
   * the dispatch-surface user routes (`/agents/:id/integrations/custom/*`)
   * serve off it (HOU-823: the hosted gateway proxies only this per-agent
   * form). Absent → those requests fall through toward the runtime channel.
   */
  customIntegrations?: CustomIntegrationManager;
  /**
   * Whether this deployment can fire event-driven routines: a trigger backend
   * (a Composio project key + a public webhook URL) exists, so a routine's
   * `trigger` binding can actually wake. True on Houston Cloud only; false on
   * desktop and self-host (absent = false). Gates the routine write path
   * (reject a trigger binding where it could never fire) and the trigger-status
   * route (report those routines as a hard error instead of fabricating health).
   * Distinct from the CLIENT-facing `capabilities.triggers`, which the managed
   * gateway advertises at its edge and this host never sets on itself.
   */
  triggersEnabled?: boolean;
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
