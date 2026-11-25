import { TURN_MODES } from "@houston/protocol";
import type { AssistantGateway } from "./assistant-forward";
import { optionalTrimmed } from "./http";
import type { RemoteMissionTarget } from "./missions-directory";

export interface RemoteMissionRoute {
  target: RemoteMissionTarget;
  gateway: AssistantGateway;
  fetchImpl?: typeof fetch;
  actingAs?: string;
}

export interface MissionStatusInput {
  id: string;
  status: "done" | "archived";
}

export interface MissionStartInput {
  title: string;
  prompt: string;
  mode?: unknown;
  provider?: string;
  model?: string;
}

export interface MissionOrigin {
  session_key: string;
  agent?: string;
  depth: number;
}

// WHY: Depth is carried, not looked up, because the parent chat may live in another pod. ADR-0016
export const MAX_MISSION_DEPTH = 1;

export const MISSION_DEPTH_ERROR =
  "a mission started by another mission can't start further missions - ask in the original chat instead";

export type MissionParse<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; code: string };

export function parseMissionStart(
  body: Record<string, unknown>,
): MissionParse<MissionStartInput> {
  const title = optionalTrimmed(body.title);
  const prompt = optionalTrimmed(body.prompt);
  if (!title || !prompt) {
    return {
      ok: false,
      code: "invalid_mission",
      error: "pass both 'title' and 'prompt'",
    };
  }
  if (
    body.mode !== undefined &&
    !(TURN_MODES as readonly unknown[]).includes(body.mode)
  ) {
    return {
      ok: false,
      code: "invalid_mission",
      error: "'mode' must be one of: plan, execute, auto",
    };
  }
  const provider = optionalTrimmed(body.provider);
  const model = optionalTrimmed(body.model);
  return {
    ok: true,
    value: {
      title,
      prompt,
      ...(body.mode !== undefined ? { mode: body.mode } : {}),
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
    },
  };
}

export function parseMissionStatus(
  body: Record<string, unknown>,
): MissionParse<MissionStatusInput> {
  const id = optionalTrimmed(body.id);
  const status = body.status;
  if (!id || (status !== "done" && status !== "archived")) {
    return {
      ok: false,
      code: "invalid_mission",
      error: "pass the mission's 'id' and 'status': 'done' or 'archived'",
    };
  }
  return { ok: true, value: { id, status } };
}

export function parseMissionOrigin(
  body: Record<string, unknown>,
): MissionParse<MissionOrigin> {
  const origin = (body.origin ?? {}) as Record<string, unknown>;
  const sessionKey = optionalTrimmed(origin.session_key);
  const agent = optionalTrimmed(origin.agent);
  if (!sessionKey || !agent) {
    return {
      ok: false,
      code: "invalid_origin",
      error:
        "pass 'origin' with the conversation and agent this mission comes from",
    };
  }
  const depth = typeof origin.depth === "number" ? origin.depth : 0;
  if (!Number.isInteger(depth) || depth < 1 || depth > MAX_MISSION_DEPTH) {
    return {
      ok: false,
      code: "mission_depth",
      error: MISSION_DEPTH_ERROR,
    };
  }
  return { ok: true, value: { session_key: sessionKey, agent, depth } };
}

export interface MissionStartResponse {
  id: string;
  title: string;
  status: "running";
  provider?: string;
  model?: string;
}
