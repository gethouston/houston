import type { ServerResponse } from "node:http";
import {
  createActivity,
  loadActivities,
  missionConversationId,
  removeById,
  saveActivities,
  upsertById,
} from "@houston/domain";
import {
  DEFAULT_TURN_MODE,
  type MissionStarter,
  parseTurnModePin,
} from "@houston/protocol";
import { assistantRuntimeRole } from "../launcher/assistant-role";
import { retirePendingFirstDay } from "./agent-first-day-retire";
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

const MAX_RUNNING_MISSIONS = 20;

export async function startMission(
  target: MissionsCtx,
  input: MissionStartInput,
  origin: MissionOrigin,
  res: ServerResponse,
  opts: { missionId?: string; startedBy?: MissionStarter } = {},
): Promise<string | null> {
  let provider: string | undefined;
  if (input.provider) {
    const resolved = await resolveMissionProvider(target, input.provider);
    if (!resolved.ok) {
      json(res, 400, { error: resolved.error, code: "invalid_provider" });
      return null;
    }
    provider = resolved.id;
  }
  const model = input.model
    ? resolveMissionModel(provider, input.model)
    : undefined;

  const mode = parseTurnModePin(input.mode);

  const channel = target.deps.channels[target.ws.runtime];
  if (!channel) {
    json(res, 503, {
      error: "missions can't be started in this install",
      code: "no_runtime",
    });
    return null;
  }

  const id = opts.missionId ?? crypto.randomUUID();
  const guarded = await withDocLock(`${target.root}#activity`, async () => {
    const { items } = await loadActivities(target.vfs, target.root);
    if (items.some((activity) => activity.id === id))
      return "duplicate" as const;
    const running = items.filter((a) => a.status === "running").length;
    if (running >= MAX_RUNNING_MISSIONS) return "cap" as const;
    const nowIso = new Date().toISOString();
    const activity = {
      ...createActivity(
        {
          title: input.title,
          description: input.prompt,
          ...(provider ? { provider } : {}),
          ...(model ? { model } : {}),
          ...(mode ? { mode } : {}),
          origin_session_key: origin.session_key,
        },
        id,
        nowIso,
        target.author,
      ),
      ...(origin.agent ? { origin_agent: origin.agent } : {}),
      origin_depth: origin.depth,
      last_message_at: nowIso,
      ...(opts.startedBy ? { started_by: opts.startedBy } : {}),
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
  if (guarded === "duplicate") {
    json(res, 409, { error: "mission already exists", code: "mission_exists" });
    return null;
  }
  fireActivityChanged(target);

  if (
    target.deps.gatewayFronted &&
    !target.actingAs &&
    !assistantRuntimeRole({ agentId: target.agent.id })
  ) {
    console.error(
      "[missions] first mission turn has no gateway acting-as identity",
    );
  }

  try {
    await channel.fireTurn(
      { workspace: target.ws, agent: target.agent },
      missionConversationId(id),
      input.prompt,
      {
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
        mode: mode ?? DEFAULT_TURN_MODE,
      },
      {
        actingUser: target.author?.user_id,
        actingAs: target.actingAs,
        limits: target.limits,
      },
    );
  } catch (err) {
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
  await retirePendingFirstDay({
    vfs: target.vfs,
    root: target.root,
    agentId: target.agent.id,
    emit: (event) => target.deps.events?.emit(target.ws.ownerUserId, event),
  });
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
