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
import { withDocLock } from "./doc-lock";
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
  // Every mutation below is a load→save over the whole activity doc;
  // serialize them per agent so concurrent requests can't drop each other's
  // entries (see doc-lock.ts). Reads stay lock-free.
  const locked = <T>(fn: () => Promise<T>) =>
    withDocLock(`${root}#activity`, fn);

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
    const activity = createActivity(
      body as unknown as NewActivity,
      (body.id as string | undefined) ?? crypto.randomUUID(),
      nowIso,
      author ?? undefined,
    );
    await locked(async () => {
      const { items } = await loadActivities(store, root);
      await saveActivities(store, root, upsertById(items, activity));
    });
    fireChange();
    json(res, 201, activity);
    return;
  }

  if (method === "PATCH" && itemId) {
    const update = await readJson(req);
    const next = await locked(async () => {
      const { items } = await loadActivities(store, root);
      const current = items.find((a) => a.id === itemId);
      if (!current) return null;
      const applied = applyActivityUpdate(
        current,
        update,
        nowIso,
        author ?? undefined,
      );
      await saveActivities(store, root, upsertById(items, applied));
      return applied;
    });
    if (!next) {
      json(res, 404, { error: "activity not found" });
      return;
    }
    fireChange();
    json(res, 200, next);
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

  json(res, 405, { error: "method not allowed" });
}
