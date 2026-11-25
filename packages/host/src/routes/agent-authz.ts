import type { IncomingMessage, ServerResponse } from "node:http";
import type { Capabilities } from "@houston/protocol";
import { ACTING_AS_HEADER } from "../auth/acting";
import type { SharedEndpointStore } from "../credentials/remote-shared-endpoint-store";
import { canUseAgent } from "../domain/access";
import type {
  Agent,
  UserId,
  Workspace,
  WorkspaceRuntime,
} from "../domain/types";
import type { EventHub } from "../events/hub";
import type { CustomIntegrationManager } from "../integrations/custom/manager";
import { CloudPaths, type WorkspacePaths } from "../paths";
import type { RuntimeChannel, WorkspaceStore } from "../ports";
import type { PushReporter } from "../telemetry/push-report";
import type { OfficePreview } from "../turn/files-office";
import type { LocalUploadSessions } from "../uploads/local";
import type { Vfs } from "../vfs";
import { json } from "./http";

export interface AgentRouteDeps {
  pushReports?: PushReporter;
  store: WorkspaceStore;
  channels: Partial<Record<WorkspaceRuntime, RuntimeChannel>>;
  vfs?: Vfs;
  uploadSessions?: LocalUploadSessions;
  officePreview?: OfficePreview;
  paths?: WorkspacePaths;
  events?: EventHub;
  capabilities?: Capabilities;
  sharedEndpoints?: SharedEndpointStore;
  agentDir?: (ws: Workspace, agent: Agent) => string;
  gatewayFronted?: boolean;
  ownerSub?: string;
  loopbackEgress?: boolean;
  storeSyncFlush?: () => Promise<void>;
  // WHY: Skips /v1/events: the gateway fan-in holds it open on every awake pod and would block idle sleep. ADR-0016
  agentRequestCount?: () => number;
  agentWriteCount?: () => number;
  customIntegrations?: CustomIntegrationManager;
  triggersEnabled?: boolean;
}

export const DEFAULT_PATHS = new CloudPaths();

export type AgentAuthz =
  | { ok: true; agent: Agent; workspace: Workspace }
  | { ok: false; status: number; reason: string };

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
    return { ok: false, status: 404, reason: "agent not found" };
  return { ok: true, agent, workspace };
}

export function channelFor(
  deps: AgentRouteDeps,
  workspace: Workspace,
): RuntimeChannel | null {
  return deps.channels[workspace.runtime] ?? null;
}

export const noChannel = (res: ServerResponse, runtime: WorkspaceRuntime) =>
  json(res, 503, { error: `${runtime} runtime not configured` });

// WHY: Only gateway-fronted pods honor the acting header; the gateway mints it and pods cannot verify it. ADR-0016
export function trustedActingAs(
  deps: AgentRouteDeps,
  req: IncomingMessage,
): string | undefined {
  if (!deps.gatewayFronted) return undefined;
  const value = req.headers[ACTING_AS_HEADER];
  return Array.isArray(value) ? value[0] : value;
}
