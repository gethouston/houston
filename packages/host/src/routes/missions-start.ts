import type { IncomingMessage, ServerResponse } from "node:http";
import { loadActivities } from "@houston/domain";
import { json, readJson } from "./http";
import { MAX_AGENT_STARTED_MISSIONS, missionFanout } from "./mission-fanout";
import {
  MAX_MISSION_DEPTH,
  type MissionOrigin,
  parseMissionStart,
} from "./missions-remote";
import { forwardMissionStart } from "./missions-remote-forward";
import { type MissionsCtx, missionSessionKey } from "./missions-sandbox";
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
  const route = await resolveMissionRoute(ctx, body.agent);
  if (!route.ok) return refuseMissionRoute(route, res);
  // The parent chat is on the CALLER's board, hence this read is not the
  // target's. A parent that is itself a mission carries the depth it was
  // started at, so the chain is counted rather than guessed - a mission whose
  // own parent lives in another pod still knows how deep it sits.
  const { items: callerItems } = await loadActivities(ctx.vfs, ctx.root);
  const parent = callerItems.find((a) => missionSessionKey(a) === parentCid);
  const depth = parent?.origin_session_key ? (parent.origin_depth ?? 1) + 1 : 1;
  if (depth > MAX_MISSION_DEPTH) {
    return json(res, 409, {
      error:
        "missions Houston started can't start further missions - ask in the original chat instead",
      code: "mission_depth",
    });
  }
  // The CALLER's own budget, which no single target board can see: without it
  // one agent spreads its starts over every other agent and trips nobody's cap.
  if (
    (await missionFanout.running(ctx.agent.id, ctx.vfs)) >=
    MAX_AGENT_STARTED_MISSIONS
  ) {
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
  if (route.remote) {
    const status = await forwardMissionStart(
      route.route,
      parsed.value,
      origin,
      res,
    );
    // The other pod owns the id it minted and never reports the mission ending,
    // so the slot is charged under an id of this side's own and aged out
    // (mission-fanout.ts) rather than reconciled.
    if (status >= 200 && status < 300)
      missionFanout.record(ctx.agent.id, {
        missionId: crypto.randomUUID(),
        boardRoot: null,
      });
    return;
  }
  const started = await startMission(route.ctx, parsed.value, origin, res);
  if (started)
    missionFanout.record(ctx.agent.id, {
      missionId: started,
      boardRoot: route.ctx.root,
    });
}
