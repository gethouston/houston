import type { IncomingMessage, ServerResponse } from "node:http";
import {
  applyActivityUpdate,
  createActivity,
  loadActivities,
  removeById,
  saveActivities,
  type TextStore,
  upsertById,
} from "@houston/domain";
import type {
  ActivityContributor,
  HoustonEvent,
  NewActivity,
} from "@houston/protocol";
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
  // The verified acting human (C2), server-stamped onto the mission as
  // `created_by` + a contributor entry on create, and upserted as a contributor
  // on PATCH. Null/absent on desktop/self-host (non-gateway-fronted), so a
  // single-player activity.json stays byte-identical (no attribution keys).
  author?: ActivityContributor,
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
    // Optional client-generated id (optimistic creation against a warming
    // engine, HOU-693). upsertById makes a same-id retry idempotent.
    if (
      body.id !== undefined &&
      (typeof body.id !== "string" ||
        body.id.trim() === "" ||
        body.id.length > 64)
    ) {
      json(res, 400, { error: "invalid 'id'" });
      return;
    }
    const { items } = await loadActivities(store, root);
    const activity = createActivity(
      body as unknown as NewActivity,
      (body.id as string | undefined) ?? crypto.randomUUID(),
      nowIso,
      author ?? undefined,
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
    const next = applyActivityUpdate(
      current,
      await readJson(req),
      nowIso,
      author ?? undefined,
    );
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
