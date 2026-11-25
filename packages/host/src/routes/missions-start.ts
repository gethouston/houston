import type { IncomingMessage, ServerResponse } from "node:http";
import { loadActivities, missionConversationKey } from "@houston/domain";
import { actingDelegatorFromHeader } from "../auth/acting";
import { json, readJson } from "./http";
import {
  MAX_AGENT_STARTED_MISSIONS,
  missionFanout,
  readRemoteMissionStatus,
} from "./mission-fanout";
import { callerMissionStarter } from "./mission-starter";
import { ownBoardViaGateway } from "./missions-own-board";
import {
  MAX_MISSION_DEPTH,
  MISSION_DEPTH_ERROR,
  type MissionOrigin,
  parseMissionStart,
} from "./missions-remote";
import { forwardMissionStart } from "./missions-remote-forward";
import type { MissionsCtx } from "./missions-sandbox";
import { startMission } from "./missions-start-run";
import { refuseMissionRoute, resolveMissionRoute } from "./missions-target";

export async function handleMissionStart(
  ctx: MissionsCtx,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req);
  const parsed = parseMissionStart(body);
  if (!parsed.ok)
    return json(res, 400, { error: parsed.error, code: parsed.code });
  const parentCid = ctx.conversationId;
  if (!parentCid) {
    return json(res, 400, {
      error: "start_mission only works during a turn",
      code: "not_in_turn",
    });
  }
  if (ctx.deps.gatewayFronted && actingDelegatorFromHeader(ctx.actingAs)) {
    return json(res, 409, {
      error:
        "missions started by an AI Employee can't start further missions - ask in the original chat instead",
      code: "mission_depth",
    });
  }
  const route = ownBoardViaGateway(
    ctx,
    await resolveMissionRoute(ctx, body.agent, {}, "start"),
  );
  if (!route.ok) return refuseMissionRoute(route, res);
  const { items: callerItems } = await loadActivities(ctx.vfs, ctx.root);
  const parent = callerItems.find(
    (a) => missionConversationKey(a) === parentCid,
  );
  const depth = parent?.origin_session_key ? (parent.origin_depth ?? 1) + 1 : 1;
  if (depth > MAX_MISSION_DEPTH) {
    return json(res, 409, {
      error: MISSION_DEPTH_ERROR,
      code: "mission_depth",
    });
  }
  if (!(await missionFanout.reserve(ctx.agent.id, ctx.vfs, ctx.actingAs))) {
    return json(res, 409, {
      error: `you already have ${MAX_AGENT_STARTED_MISSIONS} missions running - wait for some to finish before starting more`,
      code: "mission_fanout",
    });
  }
  const origin: MissionOrigin = {
    session_key: parentCid,
    agent: ctx.agent.id,
    depth,
  };
  let recorded = false;
  try {
    if (route.remote) {
      const started = await forwardMissionStart(
        route.route,
        parsed.value,
        origin,
        res,
      );
      if (started.status >= 200 && started.status < 300) {
        const missionId = started.missionId;
        if (!missionId)
          console.error("[missions] remote start returned no mission id");
        await missionFanout.recordReserved(ctx.agent.id, {
          missionId: missionId ?? crypto.randomUUID(),
          boardRoot: null,
          ...(missionId
            ? {
                readStatus: (actingAs?: string) =>
                  readRemoteMissionStatus(
                    {
                      ...route.route,
                      actingAs: actingAs ?? route.route.actingAs,
                    },
                    missionId,
                  ),
              }
            : {}),
        });
        recorded = true;
      }
      return;
    }
    const started = await startMission(route.ctx, parsed.value, origin, res, {
      startedBy: callerMissionStarter(ctx.agent.id),
    });
    if (started) {
      await missionFanout.recordReserved(ctx.agent.id, {
        missionId: started,
        boardRoot: route.ctx.root,
      });
      recorded = true;
    }
  } finally {
    if (!recorded) await missionFanout.releaseReservation(ctx.agent.id);
  }
}
