import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createActivity,
  loadActivities,
  removeById,
  saveActivities,
  upsertById,
} from "@houston/domain";
import { normalizeTurnMode } from "@houston/protocol";
import { withDocLock } from "./doc-lock";
import { json, readJson } from "./http";
import {
  resolveMissionModel,
  resolveMissionProvider,
} from "./missions-provider";
import {
  MISSION_ORIGIN_DEPTH,
  type MissionStartInput,
  parseMissionStart,
} from "./missions-remote";
import { forwardMissionStart } from "./missions-remote-forward";
import {
  fireActivityChanged,
  type MissionsCtx,
  missionSessionKey,
} from "./missions-sandbox";
import { refuseMissionRoute, resolveMissionRoute } from "./missions-target";

/** Fan-out guard: refuse new agent-started missions past this many `running`
 *  cards. Keeps a looping agent from flooding the board (the OpenCode
 *  unbounded-recursion failure mode); generous enough for real orchestration. */
const MAX_RUNNING_MISSIONS = 20;

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
  // The parent conversation is the agent-started marker AND what the depth
  // guard keys on; the tool always forwards it during a turn.
  const parentCid = ctx.conversationId;
  if (!parentCid) {
    return json(res, 400, {
      error: "start_mission only works during a turn",
      code: "not_in_turn",
    });
  }
  const route = await resolveMissionRoute(ctx, body.agent);
  if (!route.ok) return refuseMissionRoute(route, res);
  // Depth 1 only: a mission Houston started never starts further missions, so
  // the board stays a flat list and a runaway spawn loop is impossible. The
  // parent chat is on the CALLER's board, hence this read is not the target's.
  const { items: callerItems } = await loadActivities(ctx.vfs, ctx.root);
  const parent = callerItems.find((a) => missionSessionKey(a) === parentCid);
  if (parent?.origin_session_key) {
    return json(res, 409, {
      error:
        "missions Houston started can't start further missions - ask in the original chat instead",
      code: "mission_depth",
    });
  }
  const origin = {
    session_key: parentCid,
    agent: ctx.agent.id,
    depth: MISSION_ORIGIN_DEPTH,
  };
  if (route.remote)
    return forwardMissionStart(route.route, parsed.value, origin, res);
  await startMission(route.ctx, parsed.value, parentCid, res);
}

/**
 * Create the mission on `target`'s board and fire its first turn. The write
 * lives on the side that OWNS the board, so the cap, the row, the event and
 * the turn are one decision wherever the call entered from.
 */
export async function startMission(
  target: MissionsCtx,
  input: MissionStartInput,
  originSessionKey: string,
  res: ServerResponse,
): Promise<void> {
  // The pin resolves against the TARGET's workspace: that agent's credentials,
  // not the caller's, have to serve the mission.
  let provider: string | undefined;
  if (input.provider) {
    const resolved = await resolveMissionProvider(target, input.provider);
    if (!resolved.ok) {
      json(res, 400, { error: resolved.error, code: "invalid_provider" });
      return;
    }
    provider = resolved.id;
  }
  // Resolved AFTER the provider: a spoken model name ("Luna") only means an id
  // in the context of the provider it belongs to.
  const model = input.model
    ? resolveMissionModel(provider, input.model)
    : undefined;

  const channel = target.deps.channels[target.ws.runtime];
  if (!channel) {
    json(res, 503, {
      error: "missions can't be started in this install",
      code: "no_runtime",
    });
    return;
  }

  const id = crypto.randomUUID();
  const guarded = await withDocLock(`${target.root}#activity`, async () => {
    const { items } = await loadActivities(target.vfs, target.root);
    const running = items.filter((a) => a.status === "running").length;
    if (running >= MAX_RUNNING_MISSIONS) return "cap" as const;
    const activity = createActivity(
      {
        title: input.title,
        // The card's preview line, as for a user-created mission.
        description: input.prompt,
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
        origin_session_key: originSessionKey,
      },
      id,
      new Date().toISOString(),
      target.author,
    );
    await saveActivities(target.vfs, target.root, upsertById(items, activity));
    return activity;
  });
  if (guarded === "cap") {
    json(res, 409, {
      error: `there are already ${MAX_RUNNING_MISSIONS} missions running - wait for some to finish first`,
      code: "mission_cap",
    });
    return;
  }
  fireActivityChanged(target);

  try {
    await channel.fireTurn(
      { workspace: target.ws, agent: target.agent },
      `activity-${id}`,
      input.prompt,
      {
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
        mode: normalizeTurnMode(input.mode),
      },
      // Integration calls in the child act as the human driving the parent
      // turn (gateway only) — the same acting hand-off a routine firing does.
      target.author?.user_id,
    );
  } catch (err) {
    // The mission never started: leave no orphan card stuck on Running.
    await withDocLock(`${target.root}#activity`, async () => {
      const { items } = await loadActivities(target.vfs, target.root);
      const result = removeById(items, id);
      if (result.removed)
        await saveActivities(target.vfs, target.root, result.items);
    });
    fireActivityChanged(target);
    const reason = err instanceof Error ? err.message : String(err);
    json(res, 502, {
      error: `couldn't start the mission: ${reason}`,
      code: "mission_not_started",
    });
    return;
  }
  json(res, 201, { id, title: input.title, status: "running" });
}
