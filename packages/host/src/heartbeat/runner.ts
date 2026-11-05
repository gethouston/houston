import { randomUUID } from "node:crypto";
import {
  getPreference,
  heartbeatDue,
  heartbeatHasNews,
  heartbeatPrompt,
  heartbeatWindowStart,
  isHeartbeatSnapshotEmpty,
  type LocalClock,
  loadHeartbeatDoc,
  localClock,
  recordHeartbeatAdmitted,
  recordHeartbeatRun,
  resolveTimezone,
  seenAfterDelivery,
} from "@houston/domain";
import {
  encodeHeartbeat,
  type HeartbeatLast,
  HeartbeatRunStatus,
} from "@houston/protocol";
import { nextStepSuggestionsReader } from "../channel/next-step-suggestions";
import type { AgentId, Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { RuntimeChannel } from "../ports";
import { ASSISTANT_CONVERSATION_ID } from "../routes/assistant";
import type { FireLock } from "../schedule/fire-lock";
import { type CollectDeps, collectHeartbeatSnapshot } from "./collect";
import { managerContext } from "./manager";
import { settlePendingBriefing } from "./settle";

export interface HeartbeatDeps extends CollectDeps {
  /** Cross-replica dedup: one briefing per workspace per local date. */
  lock: FireLock;
  channel: RuntimeChannel;
  events?: EventHub;
  /** Materialize the manager's synthetic directory (routes/assistant.ts). */
  ensureAgentDir: (agentId: AgentId) => void;
  now?: () => Date;
}

/** How one attempt ended. Only quiet, delivered and error are recorded. */
export type HeartbeatOutcome =
  | { kind: "not_due" }
  | { kind: "busy" }
  | { kind: "locked" }
  | { kind: typeof HeartbeatRunStatus.Quiet }
  | { kind: typeof HeartbeatRunStatus.Delivered }
  | { kind: typeof HeartbeatRunStatus.Error; reason: string };

/** Outlives the local day in any zone, so a date is never fired twice. */
const LOCK_TTL_SEC = 2 * 86_400;

const reasonOf = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).slice(0, 300);

/**
 * The AI Manager's daily briefing runs on its own `assistant` conversation.
 * Empty snapshots, or no news on a scheduled tick, record "quiet" without
 * calling the model. Admission records "delivered"; a later tick settles
 * the finished turn, advances the news baseline, and notifies the person.
 * Attempts run one at a time so a manual run cannot race the daily tick.
 */
export class HeartbeatRunner {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly now: () => Date;

  constructor(private readonly deps: HeartbeatDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** The daemon's path: only when due, and only once per local date. */
  tick(): Promise<HeartbeatOutcome> {
    return this.once(false);
  }

  /** "Brief me now": ignores the time and the date, still never mid-turn. */
  runNow(): Promise<HeartbeatOutcome> {
    return this.once(true);
  }

  private once(force: boolean): Promise<HeartbeatOutcome> {
    const next = this.queue
      .catch(() => undefined)
      .then(() => this.attempt(force));
    this.queue = next;
    return next;
  }

  private async attempt(force: boolean): Promise<HeartbeatOutcome> {
    const { deps } = this;
    const now = this.now();
    const ws = await deps.store.getOrCreatePersonalWorkspace(deps.userId);
    let state = await loadHeartbeatDoc(deps.vfs, ws.id);
    // An admitted briefing counts once its turn finishes (settle.ts).
    if (state.pending)
      state = await settlePendingBriefing(
        deps,
        ws,
        await managerContext(deps, ws),
        state,
        now,
      );
    const timezone = resolveTimezone(
      await getPreference(deps.vfs, ws.id, "timezone"),
    );
    const clock = localClock(now, timezone);
    if (!force && !heartbeatDue(state, state.last, clock))
      return { kind: "not_due" };

    const ctx = await managerContext(deps, ws);
    // Never into a running turn: retried on the next tick, nothing recorded.
    if (await deps.channel.busy(ctx)) return { kind: "busy" };
    // Read before the date is burned: a snapshot that throws leaves today
    // unclaimed, so the next tick retries instead of losing the day.
    const snapshot = await collectHeartbeatSnapshot(
      deps,
      heartbeatWindowStart(now.getTime()),
      new Set(state.seen),
    );
    if (
      !force &&
      !(await deps.lock.setNx(
        `heartbeat:fired:${ws.id}:${clock.date}`,
        "1",
        LOCK_TTL_SEC,
      ))
    )
      return { kind: "locked" };
    const worthSaying = force
      ? !isHeartbeatSnapshotEmpty(snapshot)
      : heartbeatHasNews(snapshot);
    if (!worthSaying) {
      await this.record(ws, clock, now, { status: HeartbeatRunStatus.Quiet });
      return { kind: HeartbeatRunStatus.Quiet };
    }
    const prompt = heartbeatPrompt({
      localDate: clock.date,
      localTime: clock.time,
      timezone: clock.timezone,
      snapshot,
      nextStepSuggestions: await nextStepSuggestionsReader(
        deps.vfs,
        deps.store,
        deps.userId,
      )(),
    });
    // The nonce rides the persisted user message: settle.ts finds the turn by it.
    const nonce = `heartbeat-${randomUUID()}`;
    try {
      await deps.channel.fireTurn(
        ctx,
        ASSISTANT_CONVERSATION_ID,
        encodeHeartbeat(prompt),
        { mode: "auto" },
        { actingUser: deps.userId, nonce },
      );
    } catch (err) {
      const reason = reasonOf(err);
      deps.log(`[heartbeat] briefing turn refused for ${ws.id}:`, err);
      await this.record(ws, clock, now, {
        status: HeartbeatRunStatus.Error,
        reason,
      });
      return { kind: HeartbeatRunStatus.Error, reason };
    }
    await recordHeartbeatAdmitted(deps.vfs, ws.id, {
      date: clock.date,
      at: now.toISOString(),
      nonce,
      seen: seenAfterDelivery(snapshot, state.seen),
    });
    this.changed(ws);
    return { kind: HeartbeatRunStatus.Delivered };
  }

  private changed(ws: Workspace): void {
    this.deps.events?.emit(ws.ownerUserId, {
      type: "HeartbeatChanged",
      workspaceId: ws.id,
    });
  }

  private async record(
    ws: Workspace,
    clock: LocalClock,
    now: Date,
    outcome:
      | { status: typeof HeartbeatRunStatus.Quiet }
      | { status: typeof HeartbeatRunStatus.Error; reason: string },
  ): Promise<void> {
    const last: HeartbeatLast = {
      ...outcome,
      date: clock.date,
      at: now.toISOString(),
    };
    await recordHeartbeatRun(this.deps.vfs, ws.id, last);
    this.changed(ws);
  }
}
