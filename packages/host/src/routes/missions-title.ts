import type { IncomingMessage, ServerResponse } from "node:http";
import {
  addressesMission,
  applyActivityUpdate,
  loadActivities,
  saveActivities,
  upsertById,
} from "@houston/domain";
import { withDocLock } from "./doc-lock";
import { json, readJson } from "./http";
import { fireActivityChanged, type MissionsCtx } from "./missions-sandbox";

export async function handleMissionTitle(
  ctx: MissionsCtx,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req);
  const cid =
    typeof body.conversation_id === "string" ? body.conversation_id : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const fallback = typeof body.fallback === "string" ? body.fallback : "";
  if (!cid || !title || !fallback) {
    json(res, 400, {
      error: "missing 'conversation_id', 'title' or 'fallback'",
    });
    return;
  }
  const applied = await withDocLock(`${ctx.root}#activity`, async () => {
    const { items } = await loadActivities(ctx.vfs, ctx.root);
    const current = items.find((a) => addressesMission(a, cid));
    if (!current || current.title !== fallback) return false;
    const next = applyActivityUpdate(
      current,
      { title },
      new Date().toISOString(),
    );
    await saveActivities(ctx.vfs, ctx.root, upsertById(items, next));
    return true;
  });
  if (applied) fireActivityChanged(ctx);
  json(res, 200, { ok: applied });
}
