import type { SequencedFrame, WireFrame } from "@houston/runtime-client";
import { MemoryTurnBus, type TurnBus } from "./bus";
import { RelayChannels } from "./relay-channel";
import { TURN_DIED_MESSAGE } from "./relay-dialect";

/**
 * The control plane's per-conversation event relay for cloudrun workspaces.
 * It preserves the web client's subscribe-then-send contract over the
 * runtime's single-request turn stream: a turn's frames are pumped in from the
 * runtime fetch and fanned out to this conversation's subscribers, with the
 * same sequencing + snapshot/sync/resume semantics as the runtime's own bus
 * (shared ReplayLog + reducer — see relay-channel.ts, which owns the stream
 * state; this class owns the one-turn-per-agent pump gate).
 *
 * One turn per AGENT at a time (the runtime hydrates/syncs whole-agent state,
 * so concurrent turns would race the workspace).
 *
 * Replica-safety: all cross-request state rides the TurnBus — the inflight
 * gate is a bus mutex with a heartbeat lease, sequenced frames broadcast on a
 * bus channel (so a subscriber on replica B sees a turn pumped on replica A),
 * cancel is a bus message the owning replica acts on, and the snapshot (with
 * its seq watermark) is a bus key.
 */

/** The inflight lease: long enough to survive GC pauses, short enough that a
 *  crashed replica frees its agents in about a minute. */
const LEASE_SEC = 90;
const LEASE_BEAT_MS = 30_000;

const inflightKey = (agentId: string) => `turn:inflight:${agentId}`;
const cancelChannel = (agentId: string) => `turn:cancel:${agentId}`;

export class TurnRelay {
  private readonly channels: RelayChannels;
  /** Agents whose turn THIS replica is pumping right now. */
  private inflightLocal = new Set<string>();
  /** In-flight dead-turn heals, deduped per conversation (see reapIfDead). */
  private healing = new Map<string, Promise<boolean>>();

  constructor(private readonly bus: TurnBus = new MemoryTurnBus()) {
    this.channels = new RelayChannels(bus);
  }

  async busy(agentId: string): Promise<boolean> {
    if (this.inflightLocal.has(agentId)) return true;
    return (await this.bus.get(inflightKey(agentId))) !== null;
  }

  /**
   * Claim the agent's turn slot and run the pump. Resolves false (running
   * nothing) when a turn is already in flight on ANY replica. A throw from
   * `run` is published as an error frame — including an abort, which reads as
   * a cancelled turn. If the pump ends with the conversation still marked
   * running (upstream died without a terminal frame), an error frame is
   * synthesized at watermark+1: a client must NEVER be left hanging on a turn
   * that no longer exists.
   */
  async start(
    agentId: string,
    conversationKey: string,
    run: (
      publish: (e: WireFrame) => Promise<void>,
      signal: AbortSignal,
    ) => Promise<void>,
  ): Promise<boolean> {
    if (this.inflightLocal.has(agentId)) return false;
    if (!(await this.bus.setNx(inflightKey(agentId), "1", LEASE_SEC)))
      return false;
    this.inflightLocal.add(agentId);

    const ctrl = new AbortController();
    const unsubCancel = this.bus.subscribe(cancelChannel(agentId), () =>
      ctrl.abort(),
    );
    const lease = setInterval(() => {
      this.bus.expire(inflightKey(agentId), LEASE_SEC).catch((err: unknown) => {
        // No request to reject here; losing the lease means another replica
        // could double-start, so this must be loud.
        console.error(`[relay] lease heartbeat failed for ${agentId}:`, err);
      });
    }, LEASE_BEAT_MS);

    await this.channels.open(conversationKey);
    const publish = (e: WireFrame) => this.publish(conversationKey, e);

    // Terminal frames synthesized by the relay carry the id of the turn they
    // terminate — read off the owned stream's snapshot (the pumped frames set
    // it; absent when the pump died before its first frame).
    const runningTurnId = () =>
      this.channels.localSnapshot(conversationKey)?.turnId;

    void run(publish, ctrl.signal)
      .catch(async (err) => {
        // Same verbatim string the runtime emits on a user stop, so the web
        // adapter renders both as a neutral "you stopped it" (not a red error).
        const message = ctrl.signal.aborted
          ? "Stopped by user"
          : err instanceof Error
            ? err.message
            : String(err);
        await publish({
          type: "error",
          data: { message },
          turnId: runningTurnId(),
        });
      })
      .finally(async () => {
        try {
          if (this.channels.localSnapshot(conversationKey)?.running) {
            await publish({
              type: "error",
              data: { message: TURN_DIED_MESSAGE },
              turnId: runningTurnId(),
            });
          }
        } finally {
          clearInterval(lease);
          unsubCancel();
          this.channels.close(conversationKey);
          this.inflightLocal.delete(agentId);
          await this.bus.del(inflightKey(agentId)).catch((err: unknown) => {
            // The lease TTL frees the slot within LEASE_SEC even if this fails.
            console.error(
              `[relay] inflight release failed for ${agentId}:`,
              err,
            );
          });
        }
      });
    return true;
  }

  /**
   * Dead-pump reaper, run at subscribe time (events route): a persisted
   * snapshot that says `running` while NO replica holds the agent's inflight
   * lease is a turn whose pump died without a terminal frame (SIGKILL'd
   * replica) — without this, the snapshot spins clients for its full TTL.
   * Ordering makes the check safe against a genuinely-starting turn: start()
   * creates the lease BEFORE any frame flips the snapshot to running, so
   * "running + no lease" can only mean the owner is gone. The heal itself
   * re-reads the snapshot and requires the SAME turnId still running, so the
   * one residual race (a clean end between the two reads) is skipped, not
   * double-terminated. Concurrent connects share one heal via `healing`.
   * Returns whether a dead turn was terminated.
   */
  async reapIfDead(agentId: string, conversationKey: string): Promise<boolean> {
    if (this.inflightLocal.has(agentId)) return false; // we own the live pump
    const snap = await this.channels.snapshot(conversationKey);
    if (!snap.running) return false; // idle — nothing to reap
    if ((await this.bus.get(inflightKey(agentId))) !== null) return false; // lease held → alive
    const inFlight = this.healing.get(conversationKey);
    if (inFlight) return inFlight;
    const heal = this.channels
      .heal(conversationKey, snap.turnId)
      .finally(() => this.healing.delete(conversationKey));
    this.healing.set(conversationKey, heal);
    return heal;
  }

  /** Abort the agent's in-flight turn — on whichever replica owns it. */
  async cancel(agentId: string): Promise<boolean> {
    if (
      !this.inflightLocal.has(agentId) &&
      (await this.bus.get(inflightKey(agentId))) === null
    ) {
      return false;
    }
    await this.bus.publish(cancelChannel(agentId), "cancel");
    return true;
  }

  /** Sequence + broadcast one frame (see RelayChannels.publish). */
  async publish(key: string, event: WireFrame): Promise<void> {
    await this.channels.publish(key, event);
  }

  subscribe(key: string, cb: (frame: SequencedFrame) => void): () => void {
    return this.channels.subscribe(key, cb);
  }

  /** The conversation's current snapshot, `seq` = the stream's watermark. */
  snapshot(key: string) {
    return this.channels.snapshot(key);
  }

  /** Replay window for a resume cursor (see RelayChannels.replayAfter). */
  replayAfter(key: string, after: number) {
    return this.channels.replayAfter(key, after);
  }
}
