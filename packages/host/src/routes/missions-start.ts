import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createActivity,
  loadActivities,
  removeById,
  saveActivities,
  upsertById,
} from "@houston/domain";
import { normalizeTurnMode, TURN_MODES } from "@houston/protocol";
import { hostProvider } from "../providers";
import { withDocLock } from "./doc-lock";
import { json, readJson } from "./http";
import {
  fireActivityChanged,
  type MissionsCtx,
  missionSessionKey,
} from "./missions-sandbox";

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
 *
 * Server-stamped facts the agent cannot author: `origin_session_key` (the
 * parent conversation — the agent-started marker) and Teams attribution.
 */
export async function handleMissionStart(
  ctx: MissionsCtx,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!title || !prompt) {
    json(res, 400, { error: "pass both 'title' and 'prompt'" });
    return;
  }
  if (
    body.mode !== undefined &&
    !(TURN_MODES as readonly unknown[]).includes(body.mode)
  ) {
    json(res, 400, {
      error: "'mode' must be one of: plan, execute, auto",
    });
    return;
  }
  const provider =
    typeof body.provider === "string" ? body.provider : undefined;
  const model = typeof body.model === "string" ? body.model : undefined;
  if (provider && !hostProvider(provider)) {
    json(res, 400, {
      error: `unknown provider: ${provider} — omit it to use the agent's current model`,
    });
    return;
  }
  // The parent conversation is the agent-started marker AND what the depth /
  // self guards key on; the tool always forwards it during a turn.
  const parentCid = ctx.conversationId;
  if (!parentCid) {
    json(res, 400, { error: "start_mission only works during a turn" });
    return;
  }

  const channel = ctx.deps.channels[ctx.ws.runtime];
  if (!channel) {
    json(res, 503, { error: "missions can't be started in this install" });
    return;
  }

  const id = crypto.randomUUID();
  const guarded = await withDocLock(`${ctx.root}#activity`, async () => {
    const { items } = await loadActivities(ctx.vfs, ctx.root);
    // Depth 1 only: a mission Houston started never starts further missions —
    // the board stays a flat list the user can actually review, and a
    // runaway spawn loop is impossible by construction.
    const parent = items.find((a) => missionSessionKey(a) === parentCid);
    if (parent?.origin_session_key) return "depth" as const;
    const running = items.filter((a) => a.status === "running").length;
    if (running >= MAX_RUNNING_MISSIONS) return "cap" as const;
    const activity = createActivity(
      {
        title,
        // The board card's preview line, same as a user-created mission whose
        // description is its first message.
        description: prompt,
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
        origin_session_key: parentCid,
      },
      id,
      new Date().toISOString(),
      ctx.author,
    );
    await saveActivities(ctx.vfs, ctx.root, upsertById(items, activity));
    return activity;
  });
  if (guarded === "depth") {
    json(res, 409, {
      error:
        "missions Houston started can't start further missions — ask in the original chat instead",
    });
    return;
  }
  if (guarded === "cap") {
    json(res, 409, {
      error: `there are already ${MAX_RUNNING_MISSIONS} missions running — wait for some to finish first`,
    });
    return;
  }
  fireActivityChanged(ctx);

  try {
    await channel.fireTurn(
      { workspace: ctx.ws, agent: ctx.agent },
      `activity-${id}`,
      prompt,
      {
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
        mode: normalizeTurnMode(body.mode),
      },
      // Integration calls in the child act as the human driving the parent
      // turn (gateway only) — the same acting hand-off a routine firing does.
      ctx.author?.user_id,
    );
  } catch (err) {
    // The mission never started: leave no orphan card stuck on Running.
    await withDocLock(`${ctx.root}#activity`, async () => {
      const { items } = await loadActivities(ctx.vfs, ctx.root);
      const result = removeById(items, id);
      if (result.removed) await saveActivities(ctx.vfs, ctx.root, result.items);
    });
    fireActivityChanged(ctx);
    const reason = err instanceof Error ? err.message : String(err);
    json(res, 502, { error: `couldn't start the mission: ${reason}` });
    return;
  }
  json(res, 201, { id, title, status: "running" });
}
