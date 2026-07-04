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
}

interface ConvState {
  feed: FeedItemVM[];
  sessionStatus: SessionStatusValue | "idle";
  boardStatus: BoardStatus | null;
  seq: number;
  /** Open streaming run: its streaming feed_type -> the feed entry id it updates. */
  streaming: Map<string, string>;
}

/** Final feed_type -> the streaming feed_type it finalizes. */
const FINAL_OF: Record<string, string> = {
  assistant_text: "assistant_text_streaming",
  thinking: "thinking_streaming",
};

/** The scope a conversation's VM is published on. */
export const conversationScope = (sessionKey: string): string =>
  `conversation/${sessionKey}`;

export class ConversationVmOutput implements FeedOutput {
  private readonly convs = new Map<string, ConvState>();

  constructor(private readonly store: ScopeStore) {}

  private state(sessionKey: string): ConvState {
    let s = this.convs.get(sessionKey);
    if (!s) {
      s = {
        feed: [],
        sessionStatus: "idle",
        boardStatus: null,
        seq: 0,
        streaming: new Map(),
      };
      this.convs.set(sessionKey, s);
    }
    return s;
  }

  pushFeedItem(_agentPath: string, sessionKey: string, item: unknown): void {
    const s = this.state(sessionKey);
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
    this.publish(sessionKey, s);
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
    _agentPath: string,
    sessionKey: string,
    status: SessionStatusValue,
  ): void {
    const s = this.state(sessionKey);
    s.sessionStatus = status;
    // A terminal status closes every open streaming run so the next turn's
    // streaming text starts a fresh bubble instead of extending this one.
    if (status === "completed" || status === "error") s.streaming.clear();
    this.publish(sessionKey, s);
  }

  /**
   * Fold the board-card status into the VM (NOT a no-op — this is the handled-
   * vs-error signal a native shell reads alongside `sessionStatus`). The board
   * is a separate SCOPE, so nothing is written there; only the conversation VM's
   * `boardStatus` is updated and republished.
   */
  async persistBoardStatus(
    _agentPath: string,
    sessionKey: string,
    status: BoardStatus,
  ): Promise<void> {
    const s = this.state(sessionKey);
    s.boardStatus = status;
    this.publish(sessionKey, s);
  }

  private publish(sessionKey: string, s: ConvState): void {
    const snapshot: ConversationVM = {
      feed: s.feed.map((f) => ({ ...f })),
      running: s.sessionStatus === "running",
      sessionStatus: s.sessionStatus,
      boardStatus: s.boardStatus,
    };
    this.store.publish(conversationScope(sessionKey), snapshot);
  }
}
