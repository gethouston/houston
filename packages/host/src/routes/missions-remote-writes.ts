import type { IncomingMessage, ServerResponse } from "node:http";
import { parseTurnLimits } from "@houston/protocol";
import { json, readJson } from "./http";
import { inboundMissionStarter } from "./mission-starter";
import { MISSION_ID_HEADER } from "./missions-calling-agent";
import { applyMissionStatus } from "./missions-manage";
import {
  parseMissionOrigin,
  parseMissionStart,
  parseMissionStatus,
} from "./missions-remote";
import type { MissionsCtx } from "./missions-sandbox";
import { startMission } from "./missions-start-run";

const gatewayMissionID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export async function statusInbound(
  ctx: MissionsCtx & { callingAgent?: string },
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req);
  if (body.agent !== undefined) {
    return json(res, 400, {
      error: "this mission call names the agent in its address",
      code: "invalid_agent",
    });
  }
  const parsed = parseMissionStatus(body);
  if (!parsed.ok)
    return json(res, 400, { error: parsed.error, code: parsed.code });
  await applyMissionStatus(ctx, parsed.value, res, {
    ...(ctx.callingAgent ? { requireOrigin: ctx.callingAgent } : {}),
  });
}

export async function startInbound(
  ctx: MissionsCtx & { callingAgent?: string },
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req);
  if (body.agent !== undefined) {
    return json(res, 400, {
      error: "this mission call names the agent in its address",
      code: "invalid_agent",
    });
  }
  const parsed = parseMissionStart(body);
  if (!parsed.ok)
    return json(res, 400, { error: parsed.error, code: parsed.code });
  const origin = parseMissionOrigin(body);
  if (!origin.ok)
    return json(res, origin.code === "mission_depth" ? 409 : 400, {
      error: origin.error,
      code: origin.code,
    });
  let missionId: string | undefined;
  if (ctx.deps.gatewayFronted && ctx.callingAgent) {
    const raw = req.headers[MISSION_ID_HEADER];
    if (typeof raw !== "string" || !gatewayMissionID.test(raw)) {
      return json(res, 400, {
        error: "a valid gateway mission id is required",
        code: "invalid_mission_id",
      });
    }
    missionId = raw;
  }
  const { agent: bodyAgent, ...parsedOrigin } = origin.value;
  const limits = ctx.deps.gatewayFronted
    ? parseTurnLimits(body.limits)
    : undefined;
  await startMission(
    limits ? { ...ctx, limits } : ctx,
    parsed.value,
    {
      ...parsedOrigin,
      ...(ctx.deps.gatewayFronted
        ? ctx.callingAgent
          ? { agent: ctx.callingAgent }
          : {}
        : { agent: bodyAgent }),
    },
    res,
    {
      ...(missionId ? { missionId } : {}),
      startedBy: inboundMissionStarter(ctx.deps, req, ctx.callingAgent),
    },
  );
}
