import type { ServerResponse } from "node:http";
import { isAgentDelegationRefusalCode } from "@houston/protocol";
import { parseComputeRefusal } from "@houston/wire-types";
import { json } from "./http";
import { delegationRefusal } from "./mission-delegation-refusals";
import type {
  MissionOrigin,
  MissionStartInput,
  MissionStatusInput,
  RemoteMissionRoute,
} from "./missions-remote";

/**
 * The mission leg that leaves the pod: one call out to the gateway, the target
 * pod's own answer back. The gateway dispatches `/agents/{slug}/…` into that
 * agent's pod (waking it if it sleeps), so these calls are the local board
 * routes addressed to an agent that lives elsewhere.
 *
 * The answer is relayed unchanged, so the runtime tool reads the same body
 * whichever side of the wire ran the call — and a refusal keeps the pod's own
 * sentence, because the model has to be able to correct itself.
 */

export const missionPath = (
  route: RemoteMissionRoute,
  suffix: string,
): string =>
  `${route.gateway.url}/agents/${encodeURIComponent(route.target.id)}/missions${suffix}`;

export function remoteHeaders(
  route: RemoteMissionRoute,
): Record<string, string> {
  return {
    Authorization: `Bearer ${route.gateway.token}`,
    ...(route.actingAs ? { "x-houston-acting-as": route.actingAs } : {}),
  };
}

/**
 * Start a mission on an agent whose board lives in another pod. Answers the
 * status the caller ended up sending, so the caller can charge the start to its
 * own fan-out budget only when the target actually took it.
 */
export async function forwardMissionStart(
  route: RemoteMissionRoute,
  input: MissionStartInput,
  origin: MissionOrigin,
  res: ServerResponse,
): Promise<{ status: number; missionId?: string }> {
  let missionId: string | undefined;
  const status = await forward(
    route,
    "POST",
    missionPath(route, "/start"),
    res,
    {
      ...input,
      origin,
    },
    (payload) => {
      const id = (payload as { id?: unknown } | null)?.id;
      if (typeof id === "string" && id.length > 0) missionId = id;
    },
  );
  return { status, ...(missionId ? { missionId } : {}) };
}

/** That agent's board, as its own pod reports it. */
export function forwardMissionList(
  route: RemoteMissionRoute,
  res: ServerResponse,
): Promise<number> {
  return forward(route, "GET", missionPath(route, ""), res);
}

/** One mission's transcript, read in the pod that runs it. */
export function forwardMissionRead(
  route: RemoteMissionRoute,
  query: { id: string; limit?: string },
  res: ServerResponse,
): Promise<number> {
  const url = new URL(missionPath(route, "/read"));
  url.searchParams.set("id", query.id);
  if (query.limit) url.searchParams.set("limit", query.limit);
  return forward(route, "GET", url.toString(), res);
}

/**
 * Move a finished mission on a board that lives in another pod. The guards
 * that decide whether the move is allowed — still running, the caller's own
 * conversation, no such mission — belong to the pod that owns the board, and
 * its refusal comes back in its own words.
 */
export function forwardMissionStatus(
  route: RemoteMissionRoute,
  input: MissionStatusInput,
  res: ServerResponse,
): Promise<number> {
  return forward(route, "POST", missionPath(route, "/status"), res, input);
}

/**
 * One call out, the target pod's own answer back, and the status this side
 * ended up sending.
 *
 * A pod refusal keeps its status and its sentence: the cap, the unknown id and
 * the "no conversation yet" answers are written for the model to act on, and a
 * generic "gateway error" in their place would strand it. Anything that is not
 * the pod answering (unreachable, non-JSON) is a 502 that says so.
 */
async function forward(
  route: RemoteMissionRoute,
  method: "GET" | "POST",
  url: string,
  res: ServerResponse,
  body?: unknown,
  onSuccess?: (payload: unknown) => void,
): Promise<number> {
  const { target } = route;
  let upstream: Response;
  try {
    upstream = await (route.fetchImpl ?? fetch)(url, {
      method,
      headers: {
        ...remoteHeaders(route),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    console.error(`[missions] ${target.name} could not be reached`, err);
    json(res, 502, {
      error: `could not reach ${target.name} right now - try again`,
      code: "agent_unreachable",
    });
    return 502;
  }
  const text = await upstream.text();
  const payload = parseJson(text);
  if (payload === undefined) {
    console.error(
      `[missions] ${target.name} answered non-JSON on ${upstream.status}: ${text.slice(0, 300)}`,
    );
    json(res, 502, {
      error: `${target.name} answered something unreadable`,
      code: "agent_unreachable",
    });
    return 502;
  }
  if (upstream.ok) {
    onSuccess?.(payload);
    json(res, upstream.status, payload);
    return upstream.status;
  }
  const refusal = parseComputeRefusal(payload);
  if (refusal) {
    console.error(
      `[missions] ${target.name} refused the call (${upstream.status}): ${refusal.code}`,
    );
    json(res, upstream.status, refusal);
    return upstream.status;
  }
  const reason = errorText(payload);
  const code = (payload as { code?: unknown } | null)?.code;
  if (isAgentDelegationRefusalCode(code)) {
    const { error } = delegationRefusal(code, target.name);
    json(res, upstream.status, { code, error });
    return upstream.status;
  }
  console.error(
    `[missions] ${target.name} refused the call (${upstream.status}): ${reason}`,
  );
  json(res, upstream.status, {
    error: reason || `${target.name} refused the call`,
    code: "agent_refused",
  });
  return upstream.status;
}

/** The parsed body, or undefined when it is not JSON (an empty body is null). */
function parseJson(text: string): unknown {
  if (text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The pod's own refusal sentence, when it wrote one. */
function errorText(payload: unknown): string {
  const error = (payload as { error?: unknown } | null)?.error;
  return typeof error === "string" ? error.slice(0, 300) : "";
}
