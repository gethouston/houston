import type { IncomingMessage, ServerResponse } from "node:http";
import {
  applyActivityUpdate,
  createActivity,
  loadActivities,
  removeById,
  saveActivities,
  upsertById,
  type TextStore,
} from "@houston/domain";
import type { HoustonEvent, NewActivity } from "@houston/protocol";
import { json, readJson } from "./http";

export async function handleActivitiesData(
  store: TextStore,
  root: string,
  agentId: string,
  method: string,
  itemId: string | null,
  req: IncomingMessage,
  res: ServerResponse,
  emit?: (event: HoustonEvent) => void,
): Promise<void> {
  const fireChange = () =>
    emit?.({ type: "ActivityChanged", agentPath: agentId });
  const nowIso = new Date().toISOString();

  if (method === "GET" && !itemId) {
    json(res, 200, await loadActivities(store, root));
    return;
  }

  if (method === "POST" && !itemId) {
    const body = await readJson(req);
    if (!body.title || typeof body.title !== "string") {
      json(res, 400, { error: "missing 'title'" });
      return;
    }
    const { items } = await loadActivities(store, root);
    const activity = createActivity(
      body as unknown as NewActivity,
      crypto.randomUUID(),
      nowIso,
    );
    await saveActivities(store, root, upsertById(items, activity));
    fireChange();
    json(res, 201, activity);
    return;
  }

  if (method === "PATCH" && itemId) {
    const { items } = await loadActivities(store, root);
    const current = items.find((a) => a.id === itemId);
    if (!current) {
      json(res, 404, { error: "activity not found" });
      return;
    }
    const next = applyActivityUpdate(current, await readJson(req), nowIso);
    await saveActivities(store, root, upsertById(items, next));
    fireChange();
    json(res, 200, next);
    return;
  }

  if (method === "DELETE" && itemId) {
    const { items } = await loadActivities(store, root);
    const removed = removeById(items, itemId);
    if (removed.removed) {
      await saveActivities(store, root, removed.items);
      fireChange();
    }
    json(res, 200, { ok: true, deleted: removed.removed });
    return;
  }

  json(res, 405, { error: "method not allowed" });
}
