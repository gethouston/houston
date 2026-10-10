import {
  getPreference,
  heartbeatDue,
  heartbeatPrompt,
  isHeartbeatSnapshotEmpty,
  type LocalClock,
  loadHeartbeat,
  localClock,
  recordHeartbeatRun,
  resolveTimezone,
} from "@houston/domain";
import {
  encodeAutoContinue,
  type HeartbeatLast,
  HeartbeatRunStatus,
} from "@houston/protocol";
import type { AgentId, Workspace } from "../domain/types";
import type { EventHub } from "../events/hub";
import type { ChannelCtx, RuntimeChannel } from "../ports";
import {
  ASSISTANT_AGENT_NAME,
  ASSISTANT_CONVERSATION_ID,
} from "../routes/assistant";
import type { FireLock } from "../schedule/fire-lock";
import { type CollectDeps, collectHeartbeatSnapshot } from "./collect";

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

const DAY_MS = 86_400_000;
/** Outlives the local day in any zone, so a date is never fired twice. */
const LOCK_TTL_SEC = 2 * 86_400;

const reasonOf = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).slice(0, 300);

/**
 * The AI Manager's daily morning briefing: one turn on the manager's own
 * `assistant` conversation, never one per agent. A deterministic snapshot runs
 * first and an empty one records "quiet" without a model call.
 *
 * Attempts run one at a time: a "brief me now" landing on the minute tick
 * waits for it, then meets the turn it started (busy) instead of racing a
 * second turn into the chat.
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
    const state = await loadHeartbeat(deps.vfs, ws.id);
    const timezone = resolveTimezone(
      await getPreference(deps.vfs, ws.id, "timezone"),
    );
    const clock = localClock(now, timezone);
    if (!force && !heartbeatDue(state, state.last, clock))
      return { kind: "not_due" };

    const agentId: AgentId = `${ws.id}/${ASSISTANT_AGENT_NAME}`;
    deps.ensureAgentDir(agentId);
    const agent = await deps.store.getAgent(agentId);
    if (!agent) throw new Error(`the AI Manager ${agentId} has no directory`);
    const ctx: ChannelCtx = { workspace: ws, agent };
    // Never into a running turn: retried on the next tick, nothing recorded.
    if (await deps.channel.busy(ctx)) return { kind: "busy" };
    const sinceMs = state.last
      ? Date.parse(state.last.at)
      : now.getTime() - DAY_MS;
    // Read before the date is burned: a snapshot that throws leaves today
    // unclaimed, so the next tick retries instead of losing the day.
    const snapshot = await collectHeartbeatSnapshot(deps, sinceMs);
    if (
      !force &&
      !(await deps.lock.setNx(
        `heartbeat:fired:${ws.id}:${clock.date}`,
        "1",
        LOCK_TTL_SEC,
      ))
    )
      return { kind: "locked" };
    if (isHeartbeatSnapshotEmpty(snapshot)) {
      await this.record(ws, clock, now, { status: HeartbeatRunStatus.Quiet });
      return { kind: HeartbeatRunStatus.Quiet };
    }
    const prompt = heartbeatPrompt({
      localDate: clock.date,
      localTime: clock.time,
      timezone: clock.timezone,
      snapshot,
    });
    try {
      await deps.channel.fireTurn(
        ctx,
        ASSISTANT_CONVERSATION_ID,
        encodeAutoContinue(prompt),
        { mode: "auto" },
        { actingUser: deps.userId },
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
    await this.record(ws, clock, now, { status: HeartbeatRunStatus.Delivered });
    deps.events?.emit(ws.ownerUserId, {
      type: "HeartbeatDelivered",
      agentPath: agent.id,
      date: clock.date,
    });
    return { kind: HeartbeatRunStatus.Delivered };
  }

  private async record(
    ws: Workspace,
    clock: LocalClock,
    now: Date,
    outcome:
      | {
          status:
            | typeof HeartbeatRunStatus.Quiet
            | typeof HeartbeatRunStatus.Delivered;
        }
      | { status: typeof HeartbeatRunStatus.Error; reason: string },
  ): Promise<void> {
    const last: HeartbeatLast = {
      ...outcome,
      date: clock.date,
      at: now.toISOString(),
    };
    await recordHeartbeatRun(this.deps.vfs, ws.id, last);
    this.deps.events?.emit(ws.ownerUserId, {
      type: "HeartbeatChanged",
      workspaceId: ws.id,
    });
  }
}
