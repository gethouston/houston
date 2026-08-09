import type { IncomingMessage, ServerResponse } from "node:http";
import {
  applyActivityUpdate,
  loadActivities,
  saveActivities,
  upsertById,
} from "@houston/domain";
import type { PendingInteraction } from "@houston/protocol";
import { withDocLock } from "./doc-lock";
import { json, readJson } from "./http";
import {
  fireActivityChanged,
  type MissionsCtx,
  missionSessionKey,
} from "./missions-sandbox";

/**
 * The agent's explicit board move (`POST /sandbox/missions/status`): `done` or
 * `archived`, finished missions only. This is the ONE deliberate exception to
 * "only the user moves a card to done" — the user delegated the review to the
 * agent (PRODUCT-1244's planning-agent flow), the move is an explicit tool call
 * visible in the parent chat, and the guards below keep it away from anything
 * still running and from the agent's own conversation (which the turn's settle
 * would immediately contradict).
 */
export async function handleMissionStatus(
  ctx: MissionsCtx,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req);
  const id = typeof body.id === "string" ? body.id : "";
  const status = body.status;
  if (!id || (status !== "done" && status !== "archived")) {
    json(res, 400, {
      error: "pass the mission's 'id' and 'status': 'done' or 'archived'",
    });
    return;
  }
  const outcome = await withDocLock(`${ctx.root}#activity`, async () => {
    const { items } = await loadActivities(ctx.vfs, ctx.root);
    const current = items.find((a) => a.id === id);
    if (!current) return "not_found" as const;
    if (current.status === "running") return "running" as const;
    if (missionSessionKey(current) === ctx.conversationId)
      return "self" as const;
    // applyActivityUpdate carries the user-move semantics: a move to `done`
    // strips the blocking interaction steps and keeps the clean-finish offers.
    const applied = applyActivityUpdate(
      current,
      { status },
      new Date().toISOString(),
      ctx.author,
    );
    await saveActivities(ctx.vfs, ctx.root, upsertById(items, applied));
    return applied;
  });
  if (outcome === "not_found") {
    json(res, 404, { error: "no mission with that id — check list_missions" });
    return;
  }
  if (outcome === "running") {
    json(res, 409, {
      error:
        "that mission is still running — wait for it to finish before moving it",
    });
    return;
  }
  if (outcome === "self") {
    json(res, 409, {
      error:
        "you can't move the mission this conversation belongs to — the user closes it when they're ready",
    });
    return;
  }
  fireActivityChanged(ctx);
  json(res, 200, { id: outcome.id, status: outcome.status });
}

/**
 * The runtime's turn-end report (`POST /sandbox/missions/settle`). Applied ONLY
 * to an agent-started mission (`origin_session_key` present) still on
 * `running`: those may have no client observing their conversation, so without
 * this report their card would sit on Running forever. Every other mission
 * keeps today's client-side settle untouched; a report for one answers
 * `{ok:false}` and writes nothing.
 */
export async function handleMissionSettle(
  ctx: MissionsCtx,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req);
  const cid =
    typeof body.conversation_id === "string" ? body.conversation_id : "";
  const status = body.status;
  if (!cid || (status !== "needs_you" && status !== "error")) {
    json(res, 400, { error: "missing 'conversation_id' or invalid 'status'" });
    return;
  }
  // Malformed interaction shapes are dropped by resolveInteractionPatch inside
  // applyActivityUpdate — pass through as-is; null clears explicitly.
  const interaction = (body.pending_interaction ??
    null) as PendingInteraction | null;
  const settled = await withDocLock(`${ctx.root}#activity`, async () => {
    const { items } = await loadActivities(ctx.vfs, ctx.root);
    const current = items.find((a) => missionSessionKey(a) === cid);
    if (!current?.origin_session_key) return false;
    if (current.status !== "running") return false;
    const applied = applyActivityUpdate(
      current,
      { status, pending_interaction: interaction },
      new Date().toISOString(),
    );
    await saveActivities(ctx.vfs, ctx.root, upsertById(items, applied));
    return true;
  });
  if (settled) fireActivityChanged(ctx);
  json(res, 200, { ok: settled });
}
