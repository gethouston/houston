import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  HoustonEvent,
  ModelCallReport,
  TurnLimits,
} from "@houston/protocol";
import type { Agent, Workspace, WorkspaceRuntime } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type {
  CredentialStore,
  CredentialVault,
  RuntimeChannel,
  WorkspaceStore,
} from "../ports";
import type { PushReporter } from "../telemetry/push-report";
import type { Vfs } from "../vfs";
import type { AssistantGateway } from "./assistant-forward";
import { bearer, json } from "./http";
import { handleAgentDirectory, handleAgentProfile } from "./missions-agents";
import { handleMissionSettle, handleMissionStatus } from "./missions-manage";
import { handleList, handleMissionRead } from "./missions-read";
import { missionsContext } from "./missions-sandbox-context";
import { handleMissionStart } from "./missions-start";
import { handleMissionTitle } from "./missions-title";
import { defineRouteFamily } from "./registry";

export interface MissionsDeps {
  store: WorkspaceStore;
  vfs?: Vfs;
  paths?: WorkspacePaths;
  events?: EventHub;
  channels: Partial<Record<WorkspaceRuntime, RuntimeChannel>>;
  gatewayFronted?: boolean;
  credentials?: CredentialStore;
  modelCallReports?: (report: ModelCallReport) => void;
  pushReports?: PushReporter;
  pooledTurn?: PooledTurnGateway;
}

export interface PooledTurnGateway {
  gateway: AssistantGateway;
  agentSlug: string;
}

export interface MissionsSandboxDeps extends MissionsDeps {
  vault: CredentialVault;
}

export interface MissionsCtx {
  deps: MissionsDeps;
  ws: Workspace;
  agent: Agent;
  vfs: Vfs;
  root: string;
  paths: WorkspacePaths;
  conversationId?: string;
  author?: { user_id: string; name?: string };
  actingAs?: string;
  limits?: TurnLimits;
}

defineRouteFamily({
  group: "sandbox-missions",
  members: [
    { method: "GET", path: "/sandbox/missions" },
    { method: "GET", path: "/sandbox/missions/read" },
    { method: "GET", path: "/sandbox/missions/agents" },
    { method: "GET", path: "/sandbox/missions/agents/read" },
    { method: "POST", path: "/sandbox/missions/start" },
    { method: "POST", path: "/sandbox/missions/status" },
    { method: "POST", path: "/sandbox/missions/settle" },
    { method: "POST", path: "/sandbox/missions/title" },
  ],
  phase: "sandbox",
  classification: "internal-sandbox",
  reason:
    "The agent's mission tools, its turn-end report and its after-turn mission title call these with a per-sandbox HMAC token, never a client.",
  source: "packages/host/src/routes/missions-sandbox.ts",
  handler: ({ deps, method, path, url, req, res }) =>
    handleSandboxMissions(deps, method, path, url, req, res),
});

export async function handleSandboxMissions(
  deps: MissionsSandboxDeps,
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const isList = method === "GET" && path === "/sandbox/missions";
  const isRead = method === "GET" && path === "/sandbox/missions/read";
  const isAgents = method === "GET" && path === "/sandbox/missions/agents";
  const isAgentRead =
    method === "GET" && path === "/sandbox/missions/agents/read";
  const isStart = method === "POST" && path === "/sandbox/missions/start";
  const isStatus = method === "POST" && path === "/sandbox/missions/status";
  const isSettle = method === "POST" && path === "/sandbox/missions/settle";
  const isTitle = method === "POST" && path === "/sandbox/missions/title";
  if (
    !isList &&
    !isRead &&
    !isAgents &&
    !isAgentRead &&
    !isStart &&
    !isStatus &&
    !isSettle &&
    !isTitle
  )
    return false;

  const sbToken = bearer(req, url);
  const claim = sbToken ? deps.vault.validateSandboxToken(sbToken) : null;
  if (!claim) {
    json(res, 401, { error: "unauthorized" });
    return true;
  }
  const ctx = await missionsContext(deps, claim, req, res, isStart || isStatus);
  if (!ctx) return true;

  if (isList) await handleList(ctx, url, res);
  else if (isRead) await handleMissionRead(ctx, url, res);
  else if (isAgents) await handleAgentDirectory(ctx, res);
  else if (isAgentRead) await handleAgentProfile(ctx, url, res);
  else if (isStart) await handleMissionStart(ctx, req, res);
  else if (isStatus) await handleMissionStatus(ctx, req, res);
  else if (isTitle) await handleMissionTitle(ctx, req, res);
  else await handleMissionSettle(ctx, req, res);
  return true;
}

export const fireActivityChanged = (ctx: MissionsCtx): void => {
  const event: HoustonEvent = {
    type: "ActivityChanged",
    agentPath: ctx.agent.id,
  };
  ctx.deps.events?.emit(ctx.ws.ownerUserId, event);
};
