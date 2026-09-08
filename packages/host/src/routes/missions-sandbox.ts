import type { IncomingMessage, ServerResponse } from "node:http";
import type { Activity, HoustonEvent } from "@houston/protocol";
import { ACTING_AS_HEADER, actingAuthorFromHeader } from "../auth/acting";
import type { Agent, Workspace, WorkspaceRuntime } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type {
  CredentialStore,
  CredentialVault,
  RuntimeChannel,
  WorkspaceStore,
} from "../ports";
import type { Vfs } from "../vfs";
import { DEFAULT_PATHS } from "./agent-authz";
import { bearer, header, json } from "./http";
import { CONVERSATION_ID_HEADER } from "./learnings-sandbox";
import { handleMissionSettle, handleMissionStatus } from "./missions-manage";
import { handleList, handleMissionRead } from "./missions-read";
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
 * Every board call takes an optional target `agent` (routes/missions-target.ts):
 * absent it acts on the calling agent's own board, present it acts on the named
 * agent's — how the personal assistant, which keeps no board of its own, puts
 * work where the user can see it.
 *
 * `/sandbox/missions/settle` is the runtime's turn-end report. Board settle is
 * normally CLIENT-side (the SDK folds the terminal frame and PATCHes status) —
 * but a mission the agent started may never have a client observing it, so the
 * runtime reports every turn end and THIS route applies it ONLY to
 * agent-started missions (`origin_session_key` present) that are still
 * `running`. User-created missions keep the client settle path untouched.
 */
export interface MissionsDeps {
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
  /**
   * The connect-once credential store, read (never written) to answer whether a
   * pinned provider is actually connected for the target workspace. Absent on a
   * deployment that keeps no central store — then no pin is refused for status.
   */
  credentials?: CredentialStore;
}

/**
 * The sandbox family's own deps: the mission handlers' plus the vault that
 * validates the runtime's sandbox token. The per-agent inbound family
 * (missions-remote-inbound.ts) is authorized by the gateway instead, so it
 * takes {@link MissionsDeps} and needs no vault.
 */
export interface MissionsSandboxDeps extends MissionsDeps {
  vault: CredentialVault;
}

/** Resolved per-request context shared by every mission handler. */
export interface MissionsCtx {
  deps: MissionsDeps;
  ws: Workspace;
  agent: Agent;
  vfs: Vfs;
  root: string;
  /** Where agent files live in the vfs — resolves another agent's roots too. */
  paths: WorkspacePaths;
  /** The calling turn's conversation id, when the tool forwarded it. */
  conversationId?: string;
  /** The verified acting human (gateway only), for Teams attribution. */
  author?: { user_id: string; name?: string };
  /**
   * The RAW gateway-minted acting-as token (gateway only). Credentials are
   * keyed by acting identity, so a member's provider status is only readable
   * with it — the same token routes/credential.ts serves that member's rows by.
   */
  actingAs?: string;
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
  const isRead = method === "GET" && path === "/sandbox/missions/read";
  const isStart = method === "POST" && path === "/sandbox/missions/start";
  const isStatus = method === "POST" && path === "/sandbox/missions/status";
  const isSettle = method === "POST" && path === "/sandbox/missions/settle";
  if (!isList && !isRead && !isStart && !isStatus && !isSettle) return false;

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
    paths,
    conversationId: header(req, CONVERSATION_ID_HEADER),
    author: deps.gatewayFronted
      ? (actingAuthorFromHeader(req.headers[ACTING_AS_HEADER]) ?? undefined)
      : undefined,
    actingAs: deps.gatewayFronted ? header(req, ACTING_AS_HEADER) : undefined,
  };

  if (isList) await handleList(ctx, url, res);
  else if (isRead) await handleMissionRead(ctx, url, res);
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
