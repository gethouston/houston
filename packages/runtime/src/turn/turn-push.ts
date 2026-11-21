import {
  addressesMission,
  docKey,
  loadActivities,
  saveActivities,
  upsertById,
  upsertContributor,
  upsertMentions,
} from "@houston/domain";
import { createPushReporter } from "@houston/host/src/telemetry/push-report";
import {
  type Activity,
  missionAudience,
  notificationReason,
  type PushReport,
  pushMissionTitle,
} from "@houston/protocol";
import type { TurnServerDeps } from "./server-types";
import { mutateTurnDocument } from "./turn-doc-cas";
import type { TurnDurabilityResult } from "./turn-durability";
import type { TurnFilesystem } from "./turn-filesystem";
import { poolIdentity } from "./turn-store";
import type { TurnRequest } from "./types";

interface TurnPushContext {
  deps: TurnServerDeps;
  turn: TurnRequest;
  turnId: string;
  filesystem: TurnFilesystem;
  resolved: {
    store: import("@houston/runtime-client/object-sync").ObjectStore;
    prefix: string;
  };
}

let gatewayRefusalWarned = false;

function reporter({ deps, turn }: TurnPushContext, claimBound = false) {
  const url = deps.turnLogUrl ?? process.env.HOUSTON_TURNLOG_URL;
  if (!url || !turn.claim || !turn.hostToken || turn.shadow) return null;
  const { org, agent } = poolIdentity(turn.gcsPrefix);
  return createPushReporter({
    report: { url, orgSlug: org, agentSlug: agent, podToken: turn.hostToken },
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(claimBound ? { maxAttempts: 1, requestTimeoutMs: 2_000 } : {}),
    warn: (message) => {
      if (message.includes("later refusals stay quiet")) {
        if (gatewayRefusalWarned) return;
        gatewayRefusalWarned = true;
      }
      if (message.includes("later refusals stay quiet")) console.warn(message);
      else console.error(message, new Error(message));
    },
    error: (message, cause) => console.error(message, cause),
  });
}

function stamped(current: Activity, turn: TurnRequest, mentioned: string[]) {
  return upsertMentions(
    upsertContributor(current, {
      user_id: turn.actingAs?.userId ?? "",
      ...(turn.actingAs?.name ? { name: turn.actingAs.name } : {}),
    }),
    mentioned,
    new Date().toISOString(),
    turn.actingAs?.userId,
  );
}

export async function stampPooledTurn(input: TurnPushContext): Promise<{
  mentionReport?: Promise<void>;
}> {
  const { turn, filesystem } = input;
  if (!turn.actingAs || !turn.claim) return {};
  const mentioned = [
    ...new Set((turn.mentions ?? []).map((m) => m.userId)),
  ].slice(0, 32);
  try {
    const hydrated = (
      await loadActivities(filesystem.vfs, filesystem.workspaceRel)
    ).items.find((item) => addressesMission(item, turn.conversationId));
    if (hydrated && stamped(hydrated, turn, mentioned) === hydrated) return {};
    const result = await mutateTurnDocument({
      store: input.resolved.store,
      prefix: input.resolved.prefix,
      filesystem,
      relativePath: docKey(filesystem.workspaceRel, "activity"),
      shouldCommit: (result) => result.changed,
      apply: async () => {
        const { items } = await loadActivities(
          filesystem.vfs,
          filesystem.workspaceRel,
        );
        const current = items.find((item) =>
          addressesMission(item, turn.conversationId),
        );
        if (!current) return { activity: undefined, changed: false };
        const next = stamped(current, turn, mentioned);
        if (next === current) return { activity: next, changed: false };
        await saveActivities(
          filesystem.vfs,
          filesystem.workspaceRel,
          upsertById(items, next),
        );
        return { activity: next, changed: true };
      },
    });
    const activity = result.activity;
    const send = reporter(input, true);
    if (activity && mentioned.length && turn.actingToken && send) {
      const mentionReport = send(
        {
          v: 1,
          kind: "mentioned",
          conversation_id: turn.conversationId,
          mission: { id: activity.id, title: pushMissionTitle(activity.title) },
          event_key: input.turnId,
          user_ids: mentioned,
        },
        turn.actingToken,
      ).catch((error: unknown) => {
        console.error("[push] pooled mention report failed", error);
      });
      return { mentionReport };
    }
  } catch (error) {
    console.error("[push] pooled attribution failed", error);
  }
  return {};
}

export async function reportPooledSettle(
  input: TurnPushContext,
  durable: TurnDurabilityResult,
  mentionReport?: Promise<void>,
): Promise<void> {
  await mentionReport;
  if (durable.outcome.error === "claim_fenced") return;
  const send = reporter(input, true);
  if (!send) return;
  try {
    const { items } = await loadActivities(
      input.filesystem.vfs,
      input.filesystem.workspaceRel,
    );
    const activity = items.find((item) =>
      addressesMission(item, input.turn.conversationId),
    );
    if (!activity) return;
    const status = durable.outcome.error ? "error" : "needs_you";
    const { reason, question_count } = notificationReason(
      status,
      durable.outcome.pendingInteraction,
    );
    const report: PushReport = {
      v: 1,
      kind: "turn_settled",
      conversation_id: input.turn.conversationId,
      mission: { id: activity.id, title: pushMissionTitle(activity.title) },
      turn_id: input.turnId,
      reason,
      question_count,
      audience: missionAudience(activity, (overflow) =>
        console.error(`[push] mission audience exceeded 512 by ${overflow}`),
      ),
    };
    await send(report);
  } catch (error) {
    console.error("[push] pooled settle report failed", error);
  }
}
