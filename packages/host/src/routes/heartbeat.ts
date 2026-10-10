import type { IncomingMessage, ServerResponse } from "node:http";
import { loadHeartbeat, setHeartbeatSettings } from "@houston/domain";
import {
  HeartbeatRefusalCode,
  HeartbeatRunStatus,
  HeartbeatSettingsPatchSchema,
} from "@houston/protocol";
import type { UserId } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { HeartbeatRunner } from "../heartbeat/runner";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { json, readJson } from "./http";
import { defineRouteFamily } from "./registry";

/**
 * The AI Manager's morning briefing (`/v1/heartbeat`): the person's settings,
 * the last run, and "brief me now". Scoped to the caller's personal workspace
 * (where the manager lives), so no id rides the path.
 *
 * Gateway-fronted, the gateway owns the manager and does not serve a
 * briefing yet, so 501 is the honest answer rather than a second, divergent
 * daemon inside one pod.
 */
export const HEARTBEAT_PATH = "/v1/heartbeat";
export const HEARTBEAT_RUN_PATH = "/v1/heartbeat/run";

export interface HeartbeatRouteDeps {
  store: WorkspaceStore;
  vfs?: Vfs;
  events?: EventHub;
  gatewayFronted?: boolean;
  /** The local profile's runner; absent → `POST …/run` answers 501. */
  heartbeat?: Pick<HeartbeatRunner, "runNow">;
}

const refuse = (
  res: ServerResponse,
  status: number,
  code: HeartbeatRefusalCode,
  error: string,
) => json(res, status, { error, code });

async function readPatch(req: IncomingMessage) {
  try {
    return HeartbeatSettingsPatchSchema.safeParse(await readJson(req));
  } catch {
    // An unparseable body is the caller's mistake, never a 500.
    return HeartbeatSettingsPatchSchema.safeParse(null);
  }
}

async function runNow(
  deps: HeartbeatRouteDeps,
  res: ServerResponse,
): Promise<void> {
  if (!deps.heartbeat)
    return refuse(
      res,
      501,
      HeartbeatRefusalCode.Unavailable,
      "no briefing runner on this host",
    );
  const outcome = await deps.heartbeat.runNow();
  switch (outcome.kind) {
    case HeartbeatRunStatus.Delivered:
    case HeartbeatRunStatus.Quiet:
      return json(res, 200, { status: outcome.kind });
    case "busy":
      return refuse(
        res,
        409,
        HeartbeatRefusalCode.TurnRunning,
        "the AI Manager is mid-turn",
      );
    case HeartbeatRunStatus.Error:
      return refuse(res, 422, HeartbeatRefusalCode.Failed, outcome.reason);
    case "not_due":
    case "locked":
      // A forced run skips both gates; reaching here is a host bug.
      throw new Error(`forced heartbeat answered ${outcome.kind}`);
  }
}

/** Returns true when the request was handled. */
export async function handleHeartbeat(
  deps: HeartbeatRouteDeps,
  userId: UserId,
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== HEARTBEAT_PATH && path !== HEARTBEAT_RUN_PATH) return false;
  const allowed = path === HEARTBEAT_PATH ? ["GET", "PUT"] : ["POST"];
  if (!allowed.includes(method)) {
    json(res, 405, { error: "method not allowed", code: "method_not_allowed" });
    return true;
  }
  if (deps.gatewayFronted) {
    refuse(
      res,
      501,
      HeartbeatRefusalCode.GatewayOnly,
      "the gateway does not serve the morning briefing yet",
    );
    return true;
  }
  if (path === HEARTBEAT_RUN_PATH) {
    await runNow(deps, res);
    return true;
  }
  const vfs = deps.vfs;
  if (!vfs) {
    refuse(
      res,
      501,
      HeartbeatRefusalCode.Unavailable,
      "no workspace store on this host",
    );
    return true;
  }
  const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
  if (method === "GET") {
    json(res, 200, await loadHeartbeat(vfs, ws.id));
    return true;
  }
  const patch = await readPatch(req);
  if (!patch.success) {
    refuse(
      res,
      400,
      HeartbeatRefusalCode.Invalid,
      'expected { enabled?: boolean, time?: "HH:MM" }',
    );
    return true;
  }
  const state = await setHeartbeatSettings(vfs, ws.id, patch.data);
  deps.events?.emit(userId, { type: "HeartbeatChanged", workspaceId: ws.id });
  json(res, 200, state);
  return true;
}

/**
 * Both paths are `owns`ed for every method: a wrong method answers 405 with
 * the `code` the clients classify on, not the dispatcher's generic refusal.
 */
defineRouteFamily({
  group: "heartbeat",
  members: [
    { method: "GET", path: HEARTBEAT_PATH },
    { method: "PUT", path: HEARTBEAT_PATH },
    { method: "POST", path: HEARTBEAT_RUN_PATH },
  ],
  owns: [HEARTBEAT_PATH, HEARTBEAT_RUN_PATH],
  phase: "user",
  classification: "sdk",
  source: "packages/host/src/routes/heartbeat.ts",
  handler: async ({ deps, userId, method, path, req, res }) => {
    await handleHeartbeat(deps, userId, method, path, req, res);
  },
});
