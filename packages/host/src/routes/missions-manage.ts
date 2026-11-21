import type { IncomingMessage, ServerResponse } from "node:http";
import {
  applyActivityUpdate,
  loadActivities,
  missionConversationKey,
  saveActivities,
  upsertById,
} from "@houston/domain";
import {
  missionAudience,
  notificationReason,
  type PendingInteraction,
  type PushReport,
  parseModelCallReport,
  pushMissionTitle,
} from "@houston/protocol";
import { assistantRuntimeRole } from "../launcher/assistant-role";
import { withDocLock } from "./doc-lock";
import { json, readJson } from "./http";
import { liveTurns } from "./live-turn";
import { delegationRefusal } from "./mission-delegation-refusals";
import { type MissionStatusInput, parseMissionStatus } from "./missions-remote";
import { forwardMissionStatus } from "./missions-remote-forward";
import { fireActivityChanged, type MissionsCtx } from "./missions-sandbox";
import { refuseMissionRoute, resolveMissionRoute } from "./missions-target";

export async function handleMissionStatus(
  callerCtx: MissionsCtx,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req);
  const parsed = parseMissionStatus(body);
  if (!parsed.ok)
    return json(res, 400, { error: parsed.error, code: parsed.code });
  const route = await resolveMissionRoute(callerCtx, body.agent, {}, "status");
  if (!route.ok) return refuseMissionRoute(route, res);
  if (route.remote) {
    await forwardMissionStatus(route.route, parsed.value, res);
    return;
  }
  await applyMissionStatus(route.ctx, parsed.value, res, {
    ...(route.ctx.agent.id !== callerCtx.agent.id &&
    !assistantRuntimeRole({ agentId: callerCtx.agent.id })
      ? { requireOrigin: callerCtx.agent.id }
      : {}),
  });
}

export async function applyMissionStatus(
  ctx: MissionsCtx,
  { id, status }: MissionStatusInput,
  res: ServerResponse,
  opts: { requireOrigin?: string } = {},
): Promise<void> {
  const outcome = await withDocLock(`${ctx.root}#activity`, async () => {
    const { items } = await loadActivities(ctx.vfs, ctx.root);
    const current = items.find((a) => a.id === id);
    if (!current) return "not_found" as const;
    if (opts.requireOrigin && current.origin_agent !== opts.requireOrigin)
      return "not_origin" as const;
    if (current.status === "running") return "running" as const;
    if (missionConversationKey(current) === ctx.conversationId)
      return "self" as const;
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
    json(res, 404, { error: "no mission with that id - check list_missions" });
    return;
  }
  if (outcome === "not_origin") {
    const { code, error } = delegationRefusal("not_mission_origin");
    json(res, 403, { code, error });
    return;
  }
  if (outcome === "running") {
    json(res, 409, {
      error:
        "that mission is still running - wait for it to finish before moving it",
    });
    return;
  }
  if (outcome === "self") {
    json(res, 409, {
      error:
        "you can't move the mission this conversation belongs to - the user closes it when they're ready",
    });
    return;
  }
  fireActivityChanged(ctx);
  json(res, 200, { id: outcome.id, status: outcome.status });
}

export async function handleMissionSettle(
  ctx: MissionsCtx,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req);
  const cid =
    typeof body.conversation_id === "string" ? body.conversation_id : "";
  const status = body.status;
  const turnId = typeof body.turn_id === "string" ? body.turn_id : "";
  const stopped = body.stopped === true;
  if (!cid || (status !== "needs_you" && status !== "error")) {
    json(res, 400, { error: "missing 'conversation_id' or invalid 'status'" });
    return;
  }
  const interaction = (body.pending_interaction ??
    null) as PendingInteraction | null;
  liveTurns.end(ctx.agent.id, cid);
  const modelCalls = parseModelCallReport(body.model_calls);
  if (modelCalls) ctx.deps.modelCallReports?.(modelCalls);
  const { settled, report } = await withDocLock(
    `${ctx.root}#activity`,
    async () => {
      const { items } = await loadActivities(ctx.vfs, ctx.root);
      const current = items.find((a) => missionConversationKey(a) === cid);
      let report: PushReport | undefined;
      if (current && turnId && !stopped && ctx.deps.pushReports) {
        const { reason, question_count } = notificationReason(
          status,
          interaction,
        );
        report = {
          v: 1,
          kind: "turn_settled",
          conversation_id: cid,
          mission: { id: current.id, title: pushMissionTitle(current.title) },
          turn_id: turnId,
          reason,
          question_count,
          audience: missionAudience(current, (overflow) =>
            console.error(
              `[push] mission audience exceeded 512 by ${overflow}`,
            ),
          ),
        };
      }
      if (!current) return { settled: false, report };
      const changesStatus =
        (Boolean(current.origin_session_key) || current.started_by === "api") &&
        current.status === "running";
      const stamp =
        !stopped && status === "needs_you" ? "last_message" : undefined;
      if (!changesStatus && !stamp) return { settled: false, report };
      const applied = applyActivityUpdate(
        current,
        changesStatus ? { status, pending_interaction: interaction } : {},
        new Date().toISOString(),
        undefined,
        stamp,
      );
      await saveActivities(ctx.vfs, ctx.root, upsertById(items, applied));
      return { settled: true, report };
    },
  );
  if (report && ctx.deps.pushReports)
    void ctx.deps
      .pushReports(report)
      .catch((error: unknown) =>
        console.error("[push] settle report failed", error),
      );
  if (settled) fireActivityChanged(ctx);
  json(res, 200, { ok: settled });
}
