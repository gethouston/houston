import type { SequencedFrame, WireFrame } from "@houston/runtime-client";
import { MemoryTurnBus, type TurnBus } from "./bus";
import { RelayChannels } from "./relay-channel";
import {
  cancelChannel,
  claimLease,
  heartbeatLease,
  inflightKey,
  releaseLease,
} from "./relay-lease";
import { pumpTurn } from "./relay-pump";

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

export class TurnRelay {
  private readonly channels: RelayChannels;
  /** Agents whose turn THIS replica is pumping right now → the conversation
   *  key plus the send nonce that started it (nonce absent for routine fires).
   *  The nonce makes a client's wake-retry re-send recognizable as the SAME
   *  request (see duplicateSend) instead of a spurious busy-409. */
  private inflightLocal = new Map<
    string,
    { key: string; nonce: string | undefined }
  >();
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
    nonce?: string,
  ): Promise<boolean> {
    if (this.inflightLocal.has(agentId)) return false;
    // The lease VALUE is the conversation key, so a conversation-scoped cancel
    // (a routine-run stop) can tell whether the slot is running ITS turn.
    if (!(await claimLease(this.bus, agentId, conversationKey))) return false;
    this.inflightLocal.set(agentId, { key: conversationKey, nonce });

    const ctrl = new AbortController();
    const unsubCancel = this.bus.subscribe(cancelChannel(agentId), () =>
      ctrl.abort(),
    );
    const stopHeartbeat = heartbeatLease(this.bus, agentId);

    await this.channels.open(conversationKey);
    pumpTurn({
      run,
      publish: (e) => this.publish(conversationKey, e),
      signal: ctrl.signal,
      runningTurnId: () => this.channels.localSnapshot(conversationKey)?.turnId,
      stillRunning: () =>
        this.channels.localSnapshot(conversationKey)?.running === true,
      release: async () => {
        stopHeartbeat();
        unsubCancel();
        this.channels.close(conversationKey);
        this.inflightLocal.delete(agentId);
        await releaseLease(this.bus, agentId);
      },
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

  /**
   * The conversation key whose turn holds the agent's slot, on any replica;
   * null when the slot is free.
   */
  async holder(agentId: string): Promise<string | null> {
    return (
      this.inflightLocal.get(agentId)?.key ??
      (await this.bus.get(inflightKey(agentId)))
    );
  }

  /**
   * Abort the agent's in-flight turn — on whichever replica owns it. With
   * `conversationKey`, only a turn on THAT conversation is aborted: the agent
   * has one slot shared by chats and routines, so a conversation-scoped cancel
   * (stopping a stale routine run) must never kill an unrelated live chat turn.
   */
  async cancel(agentId: string, conversationKey?: string): Promise<boolean> {
    const inflight = await this.holder(agentId);
    if (inflight === null) return false;
    if (conversationKey && inflight !== conversationKey) return false;
    await this.bus.publish(cancelChannel(agentId), "cancel");
    return true;
  }

  /**
   * Whether a send is a REPLAY of the turn this replica is pumping right now:
   * same conversation, same non-empty nonce. A caller that lost the response
   * to its accepted send (a torn connection mid-pod-boot) retries the same
   * request; answering that retry "busy" fails a turn that is actually running
   * — the caller should hear "accepted" again instead (HOU-807).
   */
  duplicateSend(
    agentId: string,
    conversationKey: string,
    nonce: string,
  ): boolean {
    const inflight = this.inflightLocal.get(agentId);
    return (
      nonce !== "" &&
      inflight?.key === conversationKey &&
      inflight?.nonce === nonce
    );
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
