import type { ServerResponse } from "node:http";
import { isAgentDelegationRefusalCode } from "@houston/protocol";
import { json } from "./http";
import { delegationRefusal } from "./mission-delegation-refusals";
import type {
  MissionOrigin,
  MissionStartInput,
  MissionStatusInput,
  RemoteMissionRoute,
} from "./missions-remote";

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

export function forwardMissionList(
  route: RemoteMissionRoute,
  res: ServerResponse,
): Promise<number> {
  return forward(route, "GET", missionPath(route, ""), res);
}

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

export function forwardMissionStatus(
  route: RemoteMissionRoute,
  input: MissionStatusInput,
  res: ServerResponse,
): Promise<number> {
  return forward(route, "POST", missionPath(route, "/status"), res, input);
}

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

function parseJson(text: string): unknown {
  if (text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function errorText(payload: unknown): string {
  const error = (payload as { error?: unknown } | null)?.error;
  return typeof error === "string" ? error.slice(0, 300) : "";
}
