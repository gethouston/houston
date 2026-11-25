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

/**
 * `POST /sandbox/missions/start` (PRODUCT-1244): create a board mission and
 * fire its first turn — the agent-side twin of the app's `createMission` flow,
 * using the SAME per-workspace channel a routine firing uses so the child turn
 * reaches the runtime exactly like a user message (fire-and-forget 202; the
 * runtime queues it behind the workdir lock until the parent turn finishes).
 * Server-stamped facts the agent cannot author: `origin_session_key` (the
 * parent conversation — the agent-started marker) and Teams attribution.
 *
 * An optional `agent` puts the mission on ANOTHER agent's board, exactly as if
 * the user had created it there; an agent in another pod gets the same start
 * over the wire (missions-remote-forward.ts) and runs {@link startMission} on
 * its own side. The two guards keep their own subjects: depth reads the
 * CALLER's board (where the parent chat lives, remote target or not), the cap
 * counts the TARGET's (that is the board being flooded).
 */

export async function handleMissionStart(
  ctx: MissionsCtx,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req);
  const parsed = parseMissionStart(body);
  if (!parsed.ok)
    return json(res, 400, { error: parsed.error, code: parsed.code });
  // WHERE THIS CALL COMES FROM: the conversation the caller named, matched
  // against the HOST's own record of the turn running there before this handler
  // ever ran (routes/missions-sandbox.ts). The parent conversation is the
  // agent-started marker AND what the depth chain is counted from, so a caller
  // that could name a conversation of its own invention would report itself as
  // a fresh top-level chat forever and the chain would never end.
  const parentCid = ctx.conversationId;
  if (!parentCid) {
    return json(res, 400, {
      error: "start_mission only works during a turn",
      code: "not_in_turn",
    });
  }
  // Runtime file tools and Claude SDK writers refuse board writes. A shell in
  // managed pods can still edit the board, so the gateway ledger and dlg are
  // the authority for one hop.
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
  // The parent chat is on the CALLER's board, hence this read is not the
  // target's. A parent that is itself a mission carries the depth it was
  // started at, so the chain is counted rather than guessed - a mission whose
  // own parent lives in another pod still knows how deep it sits.
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
  // The CALLER's own budget, which no single target board can see: without it
  // one agent spreads its starts over every other agent and trips nobody's cap.
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
      // A malformed successful response still consumes a slot: without the id
      // the caller cannot prove when the remote mission settles.
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
    // The starter is the CALLER's role, read before the route retargeted it.
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
