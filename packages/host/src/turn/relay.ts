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

export class TurnRelay {
  private readonly channels: RelayChannels;
  private inflightLocal = new Map<
    string,
    { key: string; nonce: string | undefined }
  >();
  private healing = new Map<string, Promise<boolean>>();

  constructor(private readonly bus: TurnBus = new MemoryTurnBus()) {
    this.channels = new RelayChannels(bus);
  }

  async busy(agentId: string): Promise<boolean> {
    if (this.inflightLocal.has(agentId)) return true;
    return (await this.bus.get(inflightKey(agentId))) !== null;
  }

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

  async reapIfDead(agentId: string, conversationKey: string): Promise<boolean> {
    if (this.inflightLocal.has(agentId)) return false;
    const snap = await this.channels.snapshot(conversationKey);
    if (!snap.running) return false;
    if ((await this.bus.get(inflightKey(agentId))) !== null) return false;
    const inFlight = this.healing.get(conversationKey);
    if (inFlight) return inFlight;
    const heal = this.channels
      .heal(conversationKey, snap.turnId)
      .finally(() => this.healing.delete(conversationKey));
    this.healing.set(conversationKey, heal);
    return heal;
  }

  async holder(agentId: string): Promise<string | null> {
    return (
      this.inflightLocal.get(agentId)?.key ??
      (await this.bus.get(inflightKey(agentId)))
    );
  }

  async cancel(agentId: string, conversationKey?: string): Promise<boolean> {
    const inflight = await this.holder(agentId);
    if (inflight === null) return false;
    if (conversationKey && inflight !== conversationKey) return false;
    await this.bus.publish(cancelChannel(agentId), "cancel");
    return true;
  }

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

  async publish(key: string, event: WireFrame): Promise<void> {
    await this.channels.publish(key, event);
  }

  subscribe(key: string, cb: (frame: SequencedFrame) => void): () => void {
    return this.channels.subscribe(key, cb);
  }

  snapshot(key: string) {
    return this.channels.snapshot(key);
  }

  replayAfter(key: string, after: number) {
    return this.channels.replayAfter(key, after);
  }
}
