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

/**
 * The two WRITE halves of the per-agent mission family
 * (missions-remote-inbound.ts): start a mission on this agent's board, and
 * move one already on it. Both are held to exactly the rules a local write
 * obeys — the guards live in the shared mission modules — and both refuse a
 * body that names an agent, because this surface serves the agent in its
 * address and a second hop would let one call fan out.
 */

/**
 * The move half: the same body a local move takes, applied to the agent in the
 * path. The guards live in {@link applyMissionStatus}, so a cross-pod move is
 * held to the identical rules as a local one — except the "never the mission
 * this conversation IS" one, which cannot fire here because the calling chat
 * lives in another pod entirely.
 */
export async function statusInbound(
  ctx: MissionsCtx & { callingAgent?: string },
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req);
  // As with a start: this route serves the agent in its address, and a second
  // hop would let one move fan out.
  if (body.agent !== undefined) {
    return json(res, 400, {
      error: "this mission call names the agent in its address",
      code: "invalid_agent",
    });
  }
  const parsed = parseMissionStatus(body);
  if (!parsed.ok)
    return json(res, 400, { error: parsed.error, code: parsed.code });
  await applyMissionStatus(
    ctx,
    parsed.value,
    res,
    ctx.callingAgent ? { requireOrigin: ctx.callingAgent } : {},
  );
}

/** The start half: the same payload a local start parses, plus its origin. */
export async function startInbound(
  ctx: MissionsCtx & { callingAgent?: string },
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req);
  // A caller naming a DIFFERENT agent has the wrong address: this route serves
  // the agent in its path, and a second hop would let one call fan out.
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
  // The gateway's plan stamp for the person the mission works for: the child
  // turn's routine saves are held to it. Trusted only behind the gateway.
  const limits = ctx.deps.gatewayFronted
    ? parseTurnLimits(body.limits)
    : undefined;
  // Only the gateway-verified header can grant an agent move rights on this row.
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
