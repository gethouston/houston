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

export class RelayChannels {
  private local = new Map<string, StreamChannel>();
  private healed = new Map<string, SequencedFrame>();

  constructor(private readonly bus: TurnBus) {}

  async open(key: string): Promise<void> {
    const prior = await this.persisted(key);
    this.healed.delete(key);
    this.local.set(
      key,
      new StreamChannel({ ...EMPTY_SNAPSHOT, seq: prior.seq }),
    );
  }

  close(key: string): void {
    this.local.delete(key);
  }

  localSnapshot(key: string): ConversationSnapshot | null {
    return this.local.get(key)?.snapshot ?? null;
  }

  async publish(key: string, event: WireFrame): Promise<SequencedFrame> {
    let ch = this.local.get(key);
    if (!ch) {
      const prior = await this.persisted(key);
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

  private async fanOut(
    key: string,
    frame: SequencedFrame,
    snap: ConversationSnapshot,
  ): Promise<void> {
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

  async snapshot(key: string): Promise<ConversationSnapshot> {
    return this.local.get(key)?.snapshot ?? this.persisted(key);
  }

  private async persisted(key: string): Promise<ConversationSnapshot> {
    return parseSnapshot(await this.bus.get(snapKey(key)));
  }

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

  async heal(key: string, expectTurnId: string | undefined): Promise<boolean> {
    if (this.local.has(key)) return false;
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
      this.local.delete(key);
    }
    return true;
  }
}
