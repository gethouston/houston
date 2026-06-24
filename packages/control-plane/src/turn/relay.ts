import {
  type ConversationSnapshot,
  EMPTY_SNAPSHOT,
  reduceSnapshot,
  type WireEvent,
} from "@houston/runtime-client";
import { MemoryTurnBus, type TurnBus } from "./bus";

/**
 * The control plane's per-conversation event relay for cloudrun workspaces.
 * It preserves the web client's subscribe-then-send contract over the
 * runtime's single-request turn stream: a turn's frames are pumped in from the
 * runtime fetch and fanned out to this conversation's subscribers, with the
 * same snapshot/sync semantics as the runtime's own bus (shared reducer).
 *
 * One turn per AGENT at a time (the runtime hydrates/syncs whole-agent state,
 * so concurrent turns would race the workspace).
 *
 * Replica-safety: all cross-request state rides the TurnBus — the inflight
 * gate is a bus mutex with a heartbeat lease, frames broadcast on a bus
 * channel (so a subscriber on replica B sees a turn pumped on replica A),
 * cancel is a bus message the owning replica acts on, and the snapshot is a
 * bus key. Every frame carries `(turnId, seq)` so a subscriber can stitch a
 * snapshot + live frames together without loss or duplication.
 */

const SNAP_TTL_SEC = 3_600;
/** The inflight lease: long enough to survive GC pauses, short enough that a
 *  crashed replica frees its agents in about a minute. */
const LEASE_SEC = 90;
const LEASE_BEAT_MS = 30_000;

const inflightKey = (agentId: string) => `turn:inflight:${agentId}`;
const cancelChannel = (agentId: string) => `turn:cancel:${agentId}`;
const eventChannel = (key: string) => `turn:ev:${key}`;
const snapKey = (key: string) => `turn:snap:${key}`;

/** A frame's position in its turn — lets subscribers dedupe against a snapshot. */
export interface FrameMeta {
  turnId: string;
  seq: number;
}

export interface RelaySnapshot extends FrameMeta {
  snapshot: ConversationSnapshot;
}

interface ChannelState {
  turnId: string;
  seq: number;
  snap: ConversationSnapshot;
}

export class TurnRelay {
  /** Publisher-side state for conversations whose turn THIS replica owns. */
  private local = new Map<string, ChannelState>();
  /** Agents whose turn THIS replica is pumping right now. */
  private inflightLocal = new Set<string>();

  constructor(private readonly bus: TurnBus = new MemoryTurnBus()) {}

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
   * synthesized: a client must NEVER be left hanging on a turn that no longer
   * exists.
   */
  async start(
    agentId: string,
    conversationKey: string,
    run: (
      publish: (e: WireEvent) => Promise<void>,
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

    this.local.set(conversationKey, {
      turnId: crypto.randomUUID(),
      seq: 0,
      snap: EMPTY_SNAPSHOT,
    });
    const publish = (e: WireEvent) => this.publish(conversationKey, e);

    void run(publish, ctrl.signal)
      .catch(async (err) => {
        // Same verbatim string the runtime emits on a user stop, so the web
        // adapter renders both as a neutral "you stopped it" (not a red error).
        const message = ctrl.signal.aborted
          ? "Stopped by you."
          : err instanceof Error
            ? err.message
            : String(err);
        await publish({ type: "error", data: { message } });
      })
      .finally(async () => {
        try {
          if (this.local.get(conversationKey)?.snap.running) {
            await publish({
              type: "error",
              data: { message: "The turn ended unexpectedly" },
            });
          }
        } finally {
          clearInterval(lease);
          unsubCancel();
          this.local.delete(conversationKey);
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

  /** Reduce + persist the snapshot, then broadcast the frame to every replica. */
  async publish(key: string, event: WireEvent): Promise<void> {
    const st = this.local.get(key) ?? {
      turnId: "",
      seq: 0,
      snap: EMPTY_SNAPSHOT,
    };
    st.seq++;
    st.snap = reduceSnapshot(st.snap, event);
    this.local.set(key, st);
    if (st.snap.running || st.snap.partial) {
      await this.bus.set(
        snapKey(key),
        JSON.stringify({ turnId: st.turnId, seq: st.seq, snapshot: st.snap }),
        SNAP_TTL_SEC,
      );
    } else {
      await this.bus.del(snapKey(key));
    }
    await this.bus.publish(
      eventChannel(key),
      JSON.stringify({ turnId: st.turnId, seq: st.seq, event }),
    );
  }

  subscribe(
    key: string,
    cb: (e: WireEvent, meta: FrameMeta) => void,
  ): () => void {
    return this.bus.subscribe(eventChannel(key), (message) => {
      const { turnId, seq, event } = JSON.parse(message) as FrameMeta & {
        event: WireEvent;
      };
      cb(event, { turnId, seq });
    });
  }

  /** The conversation's current snapshot with its (turnId, seq) watermark. */
  async snapshot(key: string): Promise<RelaySnapshot> {
    const owned = this.local.get(key);
    if (owned)
      return { snapshot: owned.snap, turnId: owned.turnId, seq: owned.seq };
    const raw = await this.bus.get(snapKey(key));
    if (!raw) return { snapshot: EMPTY_SNAPSHOT, turnId: "", seq: 0 };
    return JSON.parse(raw) as RelaySnapshot;
  }
}
