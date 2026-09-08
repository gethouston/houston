import type { ServerResponse } from "node:http";
import {
  createActivity,
  loadActivities,
  removeById,
  saveActivities,
  upsertById,
} from "@houston/domain";
import { normalizeTurnMode } from "@houston/protocol";
import { withDocLock } from "./doc-lock";
import { json } from "./http";
import {
  resolveMissionModel,
  resolveMissionProvider,
} from "./missions-provider";
import type {
  MissionOrigin,
  MissionStartInput,
  MissionStartResponse,
} from "./missions-remote";
import { fireActivityChanged, type MissionsCtx } from "./missions-sandbox";

/** Fan-out guard: refuse new agent-started missions past this many `running`
 *  cards on ONE board. Keeps a looping agent from flooding a single agent (the
 *  OpenCode unbounded-recursion failure mode); the CALLER's own budget across
 *  every board is mission-fanout.ts. */
const MAX_RUNNING_MISSIONS = 20;

/**
 * Create the mission on `target`'s board and fire its first turn. The write
 * lives on the side that OWNS the board, so the cap, the row, the event and
 * the turn are one decision wherever the call entered from.
 */
export async function startMission(
  target: MissionsCtx,
  input: MissionStartInput,
  origin: MissionOrigin,
  res: ServerResponse,
): Promise<string | null> {
  // The pin resolves against the TARGET's workspace: that agent's credentials,
  // not the caller's, have to serve the mission.
  let provider: string | undefined;
  if (input.provider) {
    const resolved = await resolveMissionProvider(target, input.provider);
    if (!resolved.ok) {
      json(res, 400, { error: resolved.error, code: "invalid_provider" });
      return null;
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
    return null;
  }

  const id = crypto.randomUUID();
  const guarded = await withDocLock(`${target.root}#activity`, async () => {
    const { items } = await loadActivities(target.vfs, target.root);
    const running = items.filter((a) => a.status === "running").length;
    if (running >= MAX_RUNNING_MISSIONS) return "cap" as const;
    // Provenance the caller cannot author and the target must not lose: WHICH
    // agent asked, and how deep this mission sits. Across pods the parent chat
    // is unreadable from here, so the row itself is the only place either fact
    // survives - and the next start counts its depth from this number.
    const activity = {
      ...createActivity(
        {
          title: input.title,
          // The card's preview line, as for a user-created mission.
          description: input.prompt,
          ...(provider ? { provider } : {}),
          ...(model ? { model } : {}),
          origin_session_key: origin.session_key,
        },
        id,
        new Date().toISOString(),
        target.author,
      ),
      origin_agent: origin.agent,
      origin_depth: origin.depth,
    };
    await saveActivities(target.vfs, target.root, upsertById(items, activity));
    return activity;
  });
  if (guarded === "cap") {
    json(res, 409, {
      error: `there are already ${MAX_RUNNING_MISSIONS} missions running - wait for some to finish first`,
      code: "mission_cap",
    });
    return null;
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
    return null;
  }
  const body: MissionStartResponse = {
    id,
    title: input.title,
    status: "running",
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
  };
  json(res, 201, body);
  return id;
}
