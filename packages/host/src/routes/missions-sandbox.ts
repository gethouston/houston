import type { IncomingMessage, ServerResponse } from "node:http";
import { loadActivities } from "@houston/domain";
import type { Activity, HoustonEvent } from "@houston/protocol";
import { ACTING_AS_HEADER, actingAuthorFromHeader } from "../auth/acting";
import type { Agent, Workspace, WorkspaceRuntime } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { CredentialVault, RuntimeChannel, WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { DEFAULT_PATHS } from "./agent-authz";
import { bearer, header, json } from "./http";
import { CONVERSATION_ID_HEADER } from "./learnings-sandbox";
import { handleMissionSettle, handleMissionStatus } from "./missions-manage";
import { handleMissionStart } from "./missions-start";

/**
 * The RUNTIME-facing mission routes (HMAC sandbox token), PRODUCT-1244 — the
 * agent's `start_mission` / `list_missions` / `update_mission_status` tools
 * call these instead of writing `.houston/activity/activity.json` with file
 * tools. Same shape and rationale as routines-sandbox.ts / learnings-sandbox.ts:
 * merge-safe read-modify-writes under the per-doc lock, events on the same
 * channel a UI write fires, and facts the agent must not author (the
 * agent-started marker `origin_session_key`, Teams attribution) stamped here.
 *
 * `/sandbox/missions/settle` is the runtime's turn-end report. Board settle is
 * normally CLIENT-side (the SDK folds the terminal frame and PATCHes status) —
 * but a mission the agent started may never have a client observing it, so the
 * runtime reports every turn end and THIS route applies it ONLY to
 * agent-started missions (`origin_session_key` present) that are still
 * `running`. User-created missions keep the client settle path untouched.
 */
export interface MissionsSandboxDeps {
  vault: CredentialVault;
  store: WorkspaceStore;
  vfs?: Vfs;
  paths?: WorkspacePaths;
  events?: EventHub;
  /** The per-workspace-runtime turn channels — how a started mission's first
   *  turn is fired (the SAME path a routine firing uses). */
  channels: Partial<Record<WorkspaceRuntime, RuntimeChannel>>;
  /** True only when a trusted gateway fronts every request (the managed pod);
   *  gates Teams attribution stamping, mirroring learnings-sandbox.ts. */
  gatewayFronted?: boolean;
}

/** Resolved per-request context shared by every mission handler. */
export interface MissionsCtx {
  deps: MissionsSandboxDeps;
  ws: Workspace;
  agent: Agent;
  vfs: Vfs;
  root: string;
  /** The calling turn's conversation id, when the tool forwarded it. */
  conversationId?: string;
  /** The verified acting human (gateway only), for Teams attribution. */
  author?: { user_id: string; name?: string };
}

/** A mission's chat address: explicit `session_key`, else `activity-<id>`. */
export const missionSessionKey = (a: Activity): string =>
  a.session_key ?? `activity-${a.id}`;

export async function handleSandboxMissions(
  deps: MissionsSandboxDeps,
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const isList = method === "GET" && path === "/sandbox/missions";
  const isStart = method === "POST" && path === "/sandbox/missions/start";
  const isStatus = method === "POST" && path === "/sandbox/missions/status";
  const isSettle = method === "POST" && path === "/sandbox/missions/settle";
  if (!isList && !isStart && !isStatus && !isSettle) return false;

  // Authenticate the sandbox (NOT a user JWT) — same gate as the other
  // /sandbox/* routes.
  const sbToken = bearer(req, url);
  const claim = sbToken ? deps.vault.validateSandboxToken(sbToken) : null;
  if (!claim) {
    json(res, 401, { error: "unauthorized" });
    return true;
  }
  const vfs = deps.vfs;
  if (!vfs) {
    json(res, 503, {
      error: "agent data not configured",
      code: "agent_data_not_configured",
    });
    return true;
  }
  const ws = await deps.store.getWorkspace(claim.workspaceId);
  const agent = await deps.store.getAgent(claim.agentId);
  if (!ws || !agent) {
    json(res, 404, { error: "agent not found" });
    return true;
  }
  const paths = deps.paths ?? DEFAULT_PATHS;
  const ctx: MissionsCtx = {
    deps,
    ws,
    agent,
    vfs,
    root: paths.agentRoot(ws, agent),
    conversationId: header(req, CONVERSATION_ID_HEADER),
    author: deps.gatewayFronted
      ? (actingAuthorFromHeader(req.headers[ACTING_AS_HEADER]) ?? undefined)
      : undefined,
  };

  if (isList) await handleList(ctx, res);
  else if (isStart) await handleMissionStart(ctx, req, res);
  else if (isStatus) await handleMissionStatus(ctx, req, res);
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

/** The board snapshot, newest first, in the compact shape the agent reads. */
async function handleList(
  ctx: MissionsCtx,
  res: ServerResponse,
): Promise<void> {
  const { items } = await loadActivities(ctx.vfs, ctx.root);
  const missions = items
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
    .slice(0, 100)
    .map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      ...(a.updated_at ? { updated_at: a.updated_at } : {}),
      ...(a.origin_session_key ? { agent_started: true } : {}),
      ...(a.routine_id ? { from_routine: true } : {}),
      ...(missionSessionKey(a) === ctx.conversationId
        ? { this_conversation: true }
        : {}),
    }));
  json(res, 200, { missions });
}
