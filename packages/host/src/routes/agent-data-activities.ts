import type { IncomingMessage, ServerResponse } from "node:http";
import {
  AGENT_SETUP_AGENT_MODE,
  applyActivityUpdate,
  createActivity,
  loadActivities,
  removeById,
  saveActivities,
  type TextStore,
  upsertById,
} from "@houston/domain";
import type {
  Activity,
  ActivityContributor,
  HoustonEvent,
  MissionStarter,
  NewActivity,
} from "@houston/protocol";
import { activityStampSchema, activityUpdateSchema } from "@houston/protocol";
import { hostOwnedApprovalCards } from "./activity-approval-cards";
import { retirePendingFirstDay } from "./agent-first-day-retire";
import { withDocLock } from "./doc-lock";
import { json, methodNotAllowed, readJson } from "./http";

// WHY: status stays out of the repeat-create comparison; the board owns it after create. ADR-0016
const CREATE_FIELDS = [
  "title",
  "description",
  "agent",
  "worktree_path",
  "provider",
  "model",
] as const satisfies readonly (keyof Activity)[];

function sameCreate(stored: Activity, incoming: Activity): boolean {
  return CREATE_FIELDS.every((field) => stored[field] === incoming[field]);
}

export async function handleActivitiesData(
  store: TextStore,
  root: string,
  agentId: string,
  method: string,
  itemId: string | null,
  req: IncomingMessage,
  res: ServerResponse,
  emit?: (event: HoustonEvent) => void,
  stamps: {
    author?: ActivityContributor;
    startedBy?: MissionStarter;
  } = {},
): Promise<void> {
  const { author, startedBy } = stamps;
  const fireChange = () =>
    emit?.({ type: "ActivityChanged", agentPath: agentId });
  const nowIso = new Date().toISOString();
  const locked = <T>(fn: () => Promise<T>) =>
    withDocLock(`${root}#activity`, fn);

  const served = (payload: unknown) => hostOwnedApprovalCards(payload, agentId);

  if (method === "GET" && !itemId) {
    json(res, 200, served(await loadActivities(store, root)));
    return;
  }

  if (method === "POST" && !itemId) {
    const body = await readJson(req);
    if (!body.title || typeof body.title !== "string") {
      json(res, 400, { error: "missing 'title'" });
      return;
    }
    if (
      body.id !== undefined &&
      (typeof body.id !== "string" ||
        body.id.trim() === "" ||
        body.id.length > 64)
    ) {
      json(res, 400, { error: "invalid 'id'" });
      return;
    }
    delete body.origin_session_key;
    const activity: Activity = {
      ...createActivity(
        body as unknown as NewActivity,
        (body.id as string | undefined) ?? crypto.randomUUID(),
        nowIso,
        author,
      ),
      ...(startedBy ? { started_by: startedBy } : {}),
    };
    const landed = await locked(async () => {
      const { items } = await loadActivities(store, root);
      const existing = items.find((item) => item.id === activity.id);
      if (existing) return { created: false, activity: existing };
      await saveActivities(store, root, [...items, activity]);
      return { created: true, activity };
    });
    if (!landed.created && !sameCreate(landed.activity, activity)) {
      json(res, 409, {
        error: "a different mission already has that id",
        code: "activity_exists",
      });
      return;
    }
    if (landed.created) fireChange();
    if (landed.activity.agent !== AGENT_SETUP_AGENT_MODE)
      await retirePendingFirstDay({ vfs: store, root, agentId, emit });
    json(res, 201, served(landed.activity));
    return;
  }

  if (method === "PATCH" && itemId) {
    const parsed = activityUpdateSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      json(res, 400, { error: "invalid activity update" });
      return;
    }
    const stamp = activityStampSchema
      .optional()
      .safeParse(
        new URL(req.url ?? "/", "http://host").searchParams.get("stamp") ??
          undefined,
      );
    const update = parsed.data;
    const next = await locked(async () => {
      const { items } = await loadActivities(store, root);
      const current = items.find((a) => a.id === itemId);
      if (!current) return null;
      const applied = applyActivityUpdate(
        current,
        update,
        nowIso,
        author,
        stamp.success ? stamp.data : undefined,
      );
      await saveActivities(store, root, upsertById(items, applied));
      return applied;
    });
    if (!next) {
      json(res, 404, { error: "activity not found" });
      return;
    }
    fireChange();
    json(res, 200, served(next));
    return;
  }

  if (method === "DELETE" && itemId) {
    const removed = await locked(async () => {
      const { items } = await loadActivities(store, root);
      const result = removeById(items, itemId);
      if (result.removed) await saveActivities(store, root, result.items);
      return result.removed;
    });
    if (removed) fireChange();
    json(res, 200, { ok: true, deleted: removed });
    return;
  }

  methodNotAllowed(res);
}
