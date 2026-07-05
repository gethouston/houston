import type { ScopeStore } from "../../store";
import type {
  BoardStatus,
  FeedOutput,
  SessionStatusValue,
} from "./feed-output";

/**
 * The SDK's built-in {@link FeedOutput}: folds one conversation's pushes into a
 * reactive {@link ConversationVM} published on the `conversation/<id>` scope, so
 * any headless consumer (native shell, test) reads a turn's progress through
 * `getSnapshot`/`subscribe` alone.
 *
 * Streaming text arrives cumulatively (each `assistant_text_streaming` carries
 * the full text so far), so it updates a SINGLE feed entry in place; its final
 * flush (`assistant_text`) finalizes the same entry — a turn's reply is one
 * bubble, never a streamed-then-duplicated pair.
 *
 * `boardStatus` mirrors exactly what a host's bus consumer sees through the
 * `persistBoardStatus` seam, because it is the ONLY signal that tells a handled
 * settle apart from a real failure: a user Stop (and a logged-out provider)
 * settles `sessionStatus === "error"` but `boardStatus === "needs_you"`, so a
 * native shell keying off `sessionStatus` alone would render a normal Stop red.
 * Read the pair: `boardStatus` `needs_you` = handled / your attention, `error` =
 * a genuine failure. `sessionStatus` semantics are unchanged, for web parity.
 */

/** A single reactive feed entry: a stable id plus the machinery's push payload. */
export interface FeedItemVM {
  id: string;
  feed_type: string;
  data: unknown;
}

/** A message queued while a turn runs — rendered in the composer, removable. */
export interface QueuedMessageVM {
  id: string;
  text: string;
  attachmentNames?: string[];
}

/** The reactive snapshot published to the `conversation/<id>` scope. */
export interface ConversationVM {
  feed: FeedItemVM[];
  /** Derived: `sessionStatus === "running"`. The spinner/loading flag. */
  running: boolean;
  sessionStatus: SessionStatusValue | "idle";
  /**
   * The persisted board-card status (the `persistBoardStatus` seam), or `null`
   * before any turn ran. Handled-vs-error lives HERE: `needs_you` = handled /
   * attention (a user Stop settles here), `error` = a real failure.
   */
  boardStatus: BoardStatus | null;
  /**
   * Messages queued while a turn runs (additive; absent when none). The sender
   * flushes them as ONE combined send when the turn settles.
   */
  queued?: QueuedMessageVM[];
}

interface ConvState {
  feed: FeedItemVM[];
  sessionStatus: SessionStatusValue | "idle";
  boardStatus: BoardStatus | null;
  seq: number;
  /** Open streaming run: its streaming feed_type -> the feed entry id it updates. */
  streaming: Map<string, string>;
  queued: QueuedMessageVM[];
}

/** Final feed_type -> the streaming feed_type it finalizes. */
const FINAL_OF: Record<string, string> = {
  assistant_text: "assistant_text_streaming",
  thinking: "thinking_streaming",
};

/**
 * The scope a conversation's VM is published on. Agent-qualified: session keys
 * are unique only within one agent — the same identity `streamKey` uses — so
 * the scope carries BOTH, and the encoding stays in here so no caller ever
 * builds or parses it (ADR-0001).
 */
export const conversationScope = (
  agentPath: string,
  sessionKey: string,
): string =>
  `conversation/${encodeURIComponent(agentPath)}/${encodeURIComponent(sessionKey)}`;

export class ConversationVmOutput implements FeedOutput {
  private readonly convs = new Map<string, ConvState>();

  constructor(private readonly store: ScopeStore) {}

  private state(agentPath: string, sessionKey: string): ConvState {
    const key = conversationScope(agentPath, sessionKey);
    let s = this.convs.get(key);
    if (!s) {
      s = {
        feed: [],
        sessionStatus: "idle",
        boardStatus: null,
        seq: 0,
        streaming: new Map(),
        queued: [],
      };
      this.convs.set(key, s);
    }
    return s;
  }

  /**
   * Replace a conversation's feed with a folded history transcript (fresh ids),
   * the hydration seam `observe` uses so a chat opens COMPLETE before any live
   * frame. History frames are all final, so the streaming map is reset — a live
   * observer attaching next starts its running turn's bubble cleanly, never
   * extending a seeded one. `sessionStatus`/`boardStatus` are untouched: the
   * attaching observer owns those. The double-render guard is by construction —
   * the running turn's reply is NOT yet in history (unsettled), so seeding it
   * plus observing it live cannot duplicate; the caller only seeds when it is
   * not already streaming this conversation.
   */
  seedHistory(
    agentPath: string,
    sessionKey: string,
    frames: readonly { feed_type: string; data: unknown }[],
  ): void {
    const s = this.state(agentPath, sessionKey);
    s.feed = frames.map((f) => ({
      id: `f${s.seq++}`,
      feed_type: f.feed_type,
      data: f.data,
    }));
    s.streaming.clear();
    this.publish(agentPath, sessionKey, s);
  }

  pushFeedItem(agentPath: string, sessionKey: string, item: unknown): void {
    const s = this.state(agentPath, sessionKey);
    const { feed_type, data } = item as { feed_type: string; data: unknown };
    const finalOf = FINAL_OF[feed_type];
    if (feed_type.endsWith("_streaming")) {
      this.upsertStreaming(s, feed_type, data);
    } else if (finalOf !== undefined && s.streaming.has(finalOf)) {
      const id = s.streaming.get(finalOf);
      const entry = s.feed.find((f) => f.id === id);
      if (entry) {
        entry.feed_type = feed_type;
        entry.data = data;
      }
      s.streaming.delete(finalOf);
    } else {
      s.feed.push({ id: `f${s.seq++}`, feed_type, data });
    }
    this.publish(agentPath, sessionKey, s);
  }

  private upsertStreaming(
    s: ConvState,
    feed_type: string,
    data: unknown,
  ): void {
    const existingId = s.streaming.get(feed_type);
    if (existingId !== undefined) {
      const entry = s.feed.find((f) => f.id === existingId);
      if (entry) {
        entry.data = data;
        return;
      }
    }
    const id = `f${s.seq++}`;
    s.feed.push({ id, feed_type, data });
    s.streaming.set(feed_type, id);
  }

  sessionStatus(
    agentPath: string,
    sessionKey: string,
    status: SessionStatusValue,
  ): void {
    const s = this.state(agentPath, sessionKey);
    s.sessionStatus = status;
    // A terminal status closes every open streaming run so the next turn's
    // streaming text starts a fresh bubble instead of extending this one.
    if (status === "completed" || status === "error") s.streaming.clear();
    this.publish(agentPath, sessionKey, s);
  }

  /**
   * Fold the board-card status into the VM (NOT a no-op — this is the handled-
   * vs-error signal a native shell reads alongside `sessionStatus`). The board
   * is a separate SCOPE, so nothing is written there; only the conversation VM's
   * `boardStatus` is updated and republished.
   */
  async persistBoardStatus(
    agentPath: string,
    sessionKey: string,
    status: BoardStatus,
  ): Promise<void> {
    const s = this.state(agentPath, sessionKey);
    s.boardStatus = status;
    this.publish(agentPath, sessionKey, s);
  }

  /** Replace the conversation's queued-message list (the send queue's seam). */
  setQueued(
    agentPath: string,
    sessionKey: string,
    queued: readonly QueuedMessageVM[],
  ): void {
    const s = this.state(agentPath, sessionKey);
    s.queued = [...queued];
    this.publish(agentPath, sessionKey, s);
  }

  private publish(agentPath: string, sessionKey: string, s: ConvState): void {
    const snapshot: ConversationVM = {
      feed: s.feed.map((f) => ({ ...f })),
      running: s.sessionStatus === "running",
      sessionStatus: s.sessionStatus,
      boardStatus: s.boardStatus,
      ...(s.queued.length ? { queued: s.queued.map((q) => ({ ...q })) } : {}),
    };
    this.store.publish(conversationScope(agentPath, sessionKey), snapshot);
  }
}
