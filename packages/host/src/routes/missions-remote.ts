import { TURN_MODES } from "@houston/protocol";
import type { AssistantGateway } from "./assistant-forward";
import { optionalTrimmed } from "./http";
import type { RemoteMissionTarget } from "./missions-directory";

/**
 * The cross-pod mission CONTRACT: what a start says, and where it came from.
 *
 * In managed cloud every agent is its own pod, so a mission the personal
 * assistant starts on another agent travels the user's own control plane —
 * `POST {gateway}/agents/{slug}/missions/start` (missions-remote-forward.ts),
 * dispatched by the gateway into that agent's pod, which serves it with the
 * SAME handlers a local start takes (missions-remote-inbound.ts). One payload
 * shape per call, parsed once here, so the two entries can never drift.
 */

/** The route a resolved remote target is driven through. */
export interface RemoteMissionRoute {
  target: RemoteMissionTarget;
  gateway: AssistantGateway;
  fetchImpl?: typeof fetch;
  // The gateway derives the acting user from the authenticated pod credential.
}

/** A board move, in the vocabulary both entries take it in. */
export interface MissionStatusInput {
  id: string;
  status: "done" | "archived";
}

/** A start request, validated but not yet resolved against a target. */
export interface MissionStartInput {
  title: string;
  prompt: string;
  mode?: unknown;
  provider?: string;
  model?: string;
}

/**
 * Where a cross-pod mission came from. The target pod stamps `session_key` as
 * the mission's `origin_session_key` (the agent-started marker the local path
 * writes), and refuses a `depth` past the first level — the same flat board
 * the local depth guard keeps, enforced on the side that owns the board.
 */
export interface MissionOrigin {
  session_key: string;
  /** The calling agent's id, recorded on the target's row as provenance. */
  agent: string;
  /** How deep the mission being started sits: 1 when a person's chat asked. */
  depth: number;
}

/**
 * The deepest a mission may sit. Depth 1 is work a PERSON asked for; a mission
 * Houston started would be depth 2, which is refused - the board stays a flat
 * list and a spawn loop cannot run away.
 *
 * The number is carried rather than assumed because the caller's parent chat
 * can live in another pod, where the target has no way to look it up: the
 * caller counts it from its own board and the target enforces the ceiling.
 */
export const MAX_MISSION_DEPTH = 1;

export type MissionParse<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; code: string };

/** The fields every start carries, wherever the call came from. */
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

/**
 * The fields every board move carries. A move is the agent's ONE deliberate
 * board write, so its two entries — the runtime's own route and the leg from
 * another pod — must accept exactly the same thing.
 */
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

/**
 * The provenance envelope a cross-pod start must carry. Missing or past the
 * first level, the mission is refused: the target owns its board's flatness,
 * and a caller claiming a deeper origin is telling it the loop already ran.
 */
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
      error:
        "missions Houston started can't start further missions - ask in the original chat instead",
    };
  }
  return { ok: true, value: { session_key: sessionKey, agent, depth } };
}

/**
 * What a successful start answers with, on BOTH entries (the local route and
 * the inbound cross-pod leg, which run the same handler). `provider`/`model`
 * are the pins the mission actually runs on as the TARGET resolved them, which
 * is why they are echoed rather than assumed: a start that named a provider
 * the target clamps, or named none at all, still has to be reported truthfully
 * by the runtime's `start_mission`. Absent means the mission inherits the
 * target runtime's own defaults, which are not decided until the turn runs.
 */
export interface MissionStartResponse {
  id: string;
  title: string;
  status: "running";
  provider?: string;
  model?: string;
}
