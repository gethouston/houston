import {
  type ConversationSnapshot,
  EMPTY_SNAPSHOT,
  type SequencedFrame,
  StreamChannel,
  type WireFrame,
} from "@houston/runtime-client";
import type { TurnBus } from "./bus";
import {
  eventChannel,
  parseSnapshot,
  SNAP_TTL_SEC,
  snapKey,
  TURN_DIED_MESSAGE,
} from "./relay-dialect";

/**
 * The relay's per-conversation stream state: sequencing + snapshot via the
 * shared StreamChannel (@houston/runtime-client — the same append → reduce →
 * fan out → clear-on-terminal ordering as the runtime's bus), plus their bus
 * persistence/broadcast. The TurnRelay owns WHEN a stream opens/closes (one
 * turn per agent, lease, cancel); this owns WHAT a conversation's stream is.
 * Bus names + the defensive snapshot decoder live in relay-dialect.ts.
 *
 * Frames are stamped here — the relay is the cloudrun stream's ONE sequencing
 * authority; an upstream seq is never trusted (see ReplayLog.append) — with a
 * per-conversation `seq`, strictly monotonic across turns, and the in-flight
 * turn's frames are buffered for `?after=` resume until the terminal frame
 * clears the window (the counter survives). Cross-replica: sequenced frames +
 * the snapshot (with its seq watermark) ride the bus; only the replay buffer
 * is replica-local, so a resume cursor landing on a non-owning replica falls
 * back to `resync`.
 */
export class RelayChannels {
  /** Publisher-side state for conversations whose turn THIS replica owns. */
  private local = new Map<string, StreamChannel>();
  /**
   * Replica-local record of the last dead-turn heal per conversation: the
   * synthesized terminal frame, servable to the one resume cursor that was
   * parked at the dead turn's watermark (the guard in replayAfter keeps a
   * stale entry inert once the stream moves on).
   */
  private healed = new Map<string, SequencedFrame>();

  constructor(private readonly bus: TurnBus) {}

  /**
   * Open the publisher-side stream for a turn this replica is about to pump,
   * continuing the conversation's seq where it left off (possibly on another
   * replica): the persisted snapshot's watermark seeds the counter.
   */
  async open(key: string): Promise<void> {
    const prior = await this.persisted(key);
    this.healed.delete(key);
    this.local.set(
      key,
      new StreamChannel({ ...EMPTY_SNAPSHOT, seq: prior.seq }),
    );
  }

  /** Drop the publisher-side state (turn over). Bus state stays for resume. */
  close(key: string): void {
    this.local.delete(key);
  }

  /** The owned stream's snapshot (null when this replica doesn't own a pump). */
  localSnapshot(key: string): ConversationSnapshot | null {
    return this.local.get(key)?.snapshot ?? null;
  }

  /**
   * Sequence + buffer the frame, reduce + persist the snapshot, and broadcast
   * to every replica — persist and broadcast run in parallel (their relative
   * order is not load-bearing: subscribers stitch by seq, and the snapshot is
   * read on connect, not per frame). The replay buffer is dropped right after
   * a terminal frame goes out (the seq counter is not). Returns the sequenced
   * frame. A publish outside a started turn (never in normal flow) seeds the
   * channel from the persisted snapshot, exactly like open().
   */
  async publish(key: string, event: WireFrame): Promise<SequencedFrame> {
    let ch = this.local.get(key);
    if (!ch) {
      const prior = await this.persisted(key);
      // Re-check: the await may have raced a concurrent open()/publish that
      // created the channel — never clobber a live counter with a stale seed.
      ch = this.local.get(key);
      if (!ch) {
        ch = new StreamChannel({ ...EMPTY_SNAPSHOT, seq: prior.seq });
        this.local.set(key, ch);
      }
    }
    return ch.publishAsync(event, (frame, snap) =>
      this.fanOut(key, frame, snap),
    );
  }

  /** Persist the snapshot + broadcast the frame (the bus half of publish). */
  private async fanOut(
    key: string,
    frame: SequencedFrame,
    snap: ConversationSnapshot,
  ): Promise<void> {
    // Always persisted (idle included): the seq watermark must outlive the
    // turn so the next turn — on any replica — continues the stream.
    await Promise.all([
      this.bus.set(snapKey(key), JSON.stringify(snap), SNAP_TTL_SEC),
      this.bus.publish(eventChannel(key), JSON.stringify(frame)),
    ]);
  }

  subscribe(key: string, cb: (frame: SequencedFrame) => void): () => void {
    return this.bus.subscribe(eventChannel(key), (message) => {
      cb(JSON.parse(message) as SequencedFrame);
    });
  }

  /** The conversation's current snapshot, `seq` = the stream's watermark. */
  async snapshot(key: string): Promise<ConversationSnapshot> {
    return this.local.get(key)?.snapshot ?? this.persisted(key);
  }

  private async persisted(key: string): Promise<ConversationSnapshot> {
    return parseSnapshot(await this.bus.get(snapKey(key)));
  }

  /**
   * The frames a resuming subscriber that saw everything up to `after` still
   * needs. Null = unserviceable → the route sends a `resync` sync instead.
   * Only the replica pumping the turn holds the buffer; elsewhere a cursor is
   * serviceable when it is already at the watermark (nothing to replay), or
   * when it points exactly at a dead turn THIS replica just healed (the one
   * synthesized terminal frame is re-servable).
   */
  async replayAfter(
    key: string,
    after: number,
  ): Promise<SequencedFrame[] | null> {
    const owned = this.local.get(key);
    if (owned) return owned.replayAfter(after);
    const snap = await this.persisted(key);
    if (after === snap.seq) return [];
    const heal = this.healed.get(key);
    if (heal && heal.seq === snap.seq && after === heal.seq - 1) return [heal];
    return null;
  }

  /**
   * Terminate a turn whose pump died (crashed replica): synthesize the
   * terminal error frame — stamped with the dead turn's id — through the
   * normal publish path, so the cleared snapshot persists and every replica's
   * subscribers see it. Re-reads the persisted snapshot first and requires it
   * to still be running under `expectTurnId`: a turn that ended cleanly (or a
   * NEW turn that started) in the meantime is left alone. The caller
   * (TurnRelay.reapIfDead) verifies the lease is not held.
   */
  async heal(key: string, expectTurnId: string | undefined): Promise<boolean> {
    if (this.local.has(key)) return false; // we own a live pump — not dead
    const prior = await this.persisted(key);
    if (this.local.has(key) || !prior.running || prior.turnId !== expectTurnId)
      return false;
    const ch = new StreamChannel(prior);
    this.local.set(key, ch);
    try {
      const frame = await ch.publishAsync(
        {
          type: "error",
          data: { message: TURN_DIED_MESSAGE },
          ...(prior.turnId ? { turnId: prior.turnId } : {}),
        },
        (f, snap) => this.fanOut(key, f, snap),
      );
      this.healed.set(key, frame);
    } finally {
      // The channel existed only to stamp + persist the heal; keeping it
      // would shadow bus reads once later turns run on other replicas.
      this.local.delete(key);
    }
    return true;
  }
}
