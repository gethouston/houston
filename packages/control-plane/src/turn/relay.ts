import {
  EMPTY_SNAPSHOT,
  reduceSnapshot,
  type ConversationSnapshot,
  type WireEvent,
} from "@houston/runtime-client";

/**
 * The control plane's per-conversation event relay for cloudrun workspaces.
 * It preserves the web client's subscribe-then-send contract over the
 * runtime's single-request turn stream: a turn's frames are pumped in from the
 * runtime fetch and fanned out to this conversation's SSE subscribers, with
 * the same snapshot/sync semantics as the runtime's own bus (shared reducer).
 *
 * One turn per AGENT at a time (the runtime hydrates/syncs whole-agent state,
 * so concurrent turns would race the workspace). Single-replica state: the
 * relay lives in CP memory, matching the control plane's replicas: 1
 * deployment. HA would move this to a shared bus — explicitly out of scope.
 */
export class TurnRelay {
  private subs = new Map<string, Set<(e: WireEvent) => void>>();
  private snaps = new Map<string, ConversationSnapshot>();
  private inflight = new Map<string, AbortController>(); // agentId → in-flight turn

  busy(agentId: string): boolean {
    return this.inflight.has(agentId);
  }

  /**
   * Claim the agent's turn slot and run the pump. Returns false (running
   * nothing) when a turn is already in flight. A throw from `run` is published
   * as an error frame — including an abort, which reads as a cancelled turn.
   * If the pump ends with the conversation still marked running (upstream died
   * without a terminal frame), an error frame is synthesized: a client must
   * NEVER be left hanging on a turn that no longer exists.
   */
  start(
    agentId: string,
    conversationKey: string,
    run: (publish: (e: WireEvent) => void, signal: AbortSignal) => Promise<void>,
  ): boolean {
    if (this.inflight.has(agentId)) return false;
    const ctrl = new AbortController();
    this.inflight.set(agentId, ctrl);
    const publish = (e: WireEvent) => this.publish(conversationKey, e);
    void run(publish, ctrl.signal)
      .catch((err) => {
        const message = ctrl.signal.aborted
          ? "Turn cancelled"
          : err instanceof Error
            ? err.message
            : String(err);
        publish({ type: "error", data: { message } });
      })
      .finally(() => {
        this.inflight.delete(agentId);
        if (this.snapshot(conversationKey).running) {
          publish({ type: "error", data: { message: "The turn ended unexpectedly" } });
        }
      });
    return true;
  }

  /** Abort the agent's in-flight turn (if any). */
  cancel(agentId: string): boolean {
    const ctrl = this.inflight.get(agentId);
    if (!ctrl) return false;
    ctrl.abort();
    return true;
  }

  publish(key: string, event: WireEvent): void {
    const next = reduceSnapshot(this.snaps.get(key) ?? EMPTY_SNAPSHOT, event);
    if (next.running || next.partial) this.snaps.set(key, next);
    else this.snaps.delete(key);
    const subs = this.subs.get(key);
    if (!subs) return;
    for (const cb of [...subs]) cb(event);
  }

  subscribe(key: string, cb: (e: WireEvent) => void): () => void {
    let set = this.subs.get(key);
    if (!set) {
      set = new Set();
      this.subs.set(key, set);
    }
    set.add(cb);
    return () => {
      const s = this.subs.get(key);
      if (!s) return;
      s.delete(cb);
      if (s.size === 0) this.subs.delete(key);
    };
  }

  snapshot(key: string): ConversationSnapshot {
    return this.snaps.get(key) ?? EMPTY_SNAPSHOT;
  }
}
