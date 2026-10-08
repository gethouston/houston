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
  missionAudience,
  notificationReason,
  type PushReport,
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

function reporter({ deps, turn }: TurnPushContext) {
  const url = deps.turnLogUrl ?? process.env.HOUSTON_TURNLOG_URL;
  if (!url || !turn.claim || !turn.hostToken || turn.shadow) return null;
  const { org, agent } = poolIdentity(turn.gcsPrefix);
  return createPushReporter({
    report: { url, orgSlug: org, agentSlug: agent, podToken: turn.hostToken },
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
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

/** Stamp the same contributor and mention aggregate as a standing pod. */
export async function stampPooledTurn(input: TurnPushContext): Promise<void> {
  const { turn, filesystem } = input;
  if (!turn.actingAs || !turn.claim) return;
  const mentioned = [
    ...new Set((turn.mentions ?? []).map((m) => m.userId)),
  ].slice(0, 32);
  try {
    const activity = await mutateTurnDocument({
      store: input.resolved.store,
      prefix: input.resolved.prefix,
      filesystem,
      relativePath: docKey(filesystem.workspaceRel, "activity"),
      shouldCommit: (activity) => activity !== undefined,
      apply: async () => {
        const { items } = await loadActivities(
          filesystem.vfs,
          filesystem.workspaceRel,
        );
        const current = items.find((item) =>
          addressesMission(item, turn.conversationId),
        );
        if (!current) return undefined;
        const next = upsertMentions(
          upsertContributor(current, {
            user_id: turn.actingAs?.userId ?? "",
            ...(turn.actingAs?.name ? { name: turn.actingAs.name } : {}),
          }),
          mentioned,
          new Date().toISOString(),
          turn.actingAs?.userId,
        );
        if (next !== current)
          await saveActivities(
            filesystem.vfs,
            filesystem.workspaceRel,
            upsertById(items, next),
          );
        return next;
      },
    });
    const send = reporter(input);
    if (activity && mentioned.length && turn.actingToken && send) {
      await send(
        {
          v: 1,
          kind: "mentioned",
          conversation_id: turn.conversationId,
          mission: { id: activity.id, title: activity.title },
          event_key: input.turnId,
          user_ids: mentioned,
        },
        turn.actingToken,
      );
    }
  } catch (error) {
    console.error("[push] pooled attribution failed", error);
  }
}

/** Called after durability, before the terminal frame closes the claim. */
export async function reportPooledSettle(
  input: TurnPushContext,
  durable: TurnDurabilityResult,
): Promise<void> {
  if (durable.outcome.error === "claim_fenced") return;
  const send = reporter(input);
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
      mission: { id: activity.id, title: activity.title },
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
