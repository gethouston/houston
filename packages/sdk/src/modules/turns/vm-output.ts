import type { PendingInteraction } from "@houston/runtime-client";
import { LruCache } from "../../lru";
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
  /**
   * Epoch-ms timestamp of this entry. A seeded history frame carries its source
   * `ChatMessage.ts`; a LIVE push that lacks one is stamped `Date.now()` at push
   * time, and a streaming/finalizing update keeps the entry's ORIGINAL `ts` (the
   * bubble is timed by when it opened, not each delta). Optional/additive: absent
   * for a pre-`ts` seeded frame; every consumer treats it as optional.
   */
  ts?: number;
  /**
   * Optimistic-send flag: `true` while this entry is a locally-pushed prompt the
   * engine has NOT yet confirmed (`pending === true` -> render a clock,
   * WhatsApp-style; absent/false -> confirmed, render a single check). It is set
   * ONLY on the one optimistic `user_message` push and cleared — stripped, same
   * id, a normal reactive snapshot update — on the FIRST subsequent server
   * evidence for the turn: any later pushed feed item, or a `sessionStatus`
   * transition to `completed`/`error`, whichever comes first. A seeded history
   * frame NEVER carries it. Optional/additive, exactly like `ts`: every consumer
   * treats it as optional and a surface that does not render it simply ignores it.
   */
  pending?: boolean;
  /**
   * Failed-send flag: `true` when this optimistic `user_message` provably never
   * reached the engine — the turn settled as a send failure (lost / rejected /
   * refused / a double-send loser) with NO server evidence. Mutually exclusive
   * with {@link pending} (a failure strips `pending`): render a failed/error
   * tick, NEVER the "Sent" check a cleared `pending` implies. Any real server
   * frame confirms the bubble first, so a delivered-then-errored turn never sets
   * this. Optional/additive like `pending`: absent means delivered (or older
   * data); a surface that does not render it simply ignores it.
   */
  failed?: boolean;
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
   * attention (a user Stop, or a clean turn that ended asking the user for
   * something, settles here), `done` = a clean turn with nothing outstanding,
   * `error` = a real failure.
   */
  boardStatus: BoardStatus | null;
  /**
   * The interaction a clean turn settled on (ask_user / request_connection),
   * mirrored from the terminal board persist so a surface can render the
   * composer-replacing card; `null` when the turn is not waiting on the user
   * (cleared on turn start and on every settle that carries no interaction).
   */
  pendingInteraction: PendingInteraction | null;
  /**
   * Messages queued while a turn runs (additive; absent when none). The sender
   * flushes them as ONE combined send when the turn settles.
   */
  queued?: QueuedMessageVM[];
  /**
   * The server-transcript window this feed was seeded from (additive; absent
   * until a WINDOWED history read seeds it — a cache paint or a full-history
   * seed carries none). `earliestLoaded` is the absolute index of the oldest
   * loaded message; `> 0` means older messages exist server-side and a surface
   * may offer/trigger load-older (HOU-819). `total` is the transcript's full
   * message count at the last read.
   */
  historyWindow?: HistoryWindowVM;
}

/** See {@link ConversationVM.historyWindow}. */
export interface HistoryWindowVM {
  earliestLoaded: number;
  total: number;
}

interface ConvState {
  feed: FeedItemVM[];
  sessionStatus: SessionStatusValue | "idle";
  boardStatus: BoardStatus | null;
  pendingInteraction: PendingInteraction | null;
  seq: number;
  /** Open streaming run: its streaming feed_type -> the feed entry id it updates. */
  streaming: Map<string, string>;
  queued: QueuedMessageVM[];
  historyWindow?: HistoryWindowVM;
}

/** Final feed_type -> the streaming feed_type it finalizes. */
const FINAL_OF: Record<string, string> = {
  assistant_text: "assistant_text_streaming",
  thinking: "thinking_streaming",
};

/**
 * How many conversations' folded transcripts are retained in memory at once.
 * Each {@link ConvState} holds a conversation's ENTIRE feed, so an unbounded map
 * would grow with total message volume across a multi-hour session. The
 * least-recently-published IDLE conversation is evicted past this bound and
 * re-hydrated from authoritative history on next {@link ConversationVmOutput.observe}.
 * Overridable via the SDK config; the default keeps a generous working window.
 */
export const DEFAULT_CONVERSATION_CACHE_MAX = 50;

/**
 * A conversation that must NOT be evicted: a running turn, an open stream, a
 * queued message, or an unconfirmed optimistic send. Dropping any of these would
 * lose in-flight state that history cannot yet re-hydrate (it is not settled).
 */
const isConvLive = (s: ConvState): boolean =>
  s.sessionStatus === "running" ||
  s.streaming.size > 0 ||
  s.queued.length > 0 ||
  s.feed.some((f) => f.pending === true);

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
  /**
   * Folded conversations, LRU-bounded so a long-lived client's memory tracks its
   * ACTIVE window, not total message volume. A live conversation (running /
   * streaming / queued / optimistic) is pinned, as is one a surface is actively
   * subscribed to — only settled, un-viewed conversations are evicted, and each
   * re-hydrates from history on next {@link observe}. Eviction also clears the
   * scope's retained snapshot (a full copy of the feed) so the whole conversation
   * is released, not just half.
   */
  private readonly convs: LruCache<string, ConvState>;

  constructor(
    private readonly store: ScopeStore,
    opts?: { cacheMax?: number },
  ) {
    this.convs = new LruCache<string, ConvState>({
      capacity: opts?.cacheMax ?? DEFAULT_CONVERSATION_CACHE_MAX,
      isPinned: (key, s) => isConvLive(s) || this.store.hasSubscribers(key),
      onEvict: (key) => this.store.clear(key),
    });
  }

  private state(agentPath: string, sessionKey: string): ConvState {
    const key = conversationScope(agentPath, sessionKey);
    let s = this.convs.get(key);
    if (!s) {
      s = {
        feed: [],
        sessionStatus: "idle",
        boardStatus: null,
        pendingInteraction: null,
        seq: 0,
        streaming: new Map(),
        queued: [],
      };
      this.convs.set(key, s);
    }
    return s;
  }

  /**
   * Explicitly drop a conversation's folded state and its retained snapshot —
   * the eviction seam a surface calls when it closes/deletes a conversation, so
   * its transcript is released immediately rather than waiting for the LRU to
   * age it out. Unlike automatic eviction this is unconditional: the caller owns
   * the decision. A later {@link observe} re-hydrates it from history.
   */
  forget(agentPath: string, sessionKey: string): void {
    const key = conversationScope(agentPath, sessionKey);
    this.convs.delete(key);
    this.store.clear(key);
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
    frames: readonly { feed_type: string; data: unknown; ts?: number }[],
    window?: HistoryWindowVM,
  ): void {
    const s = this.state(agentPath, sessionKey);
    // History frames carry their source `ChatMessage.ts` (absent for a pre-`ts`
    // transcript); pass it through verbatim — a seeded frame is historical, so
    // it is never stamped with the wall clock the way a live push is.
    s.feed = frames.map((f) => ({
      id: `f${s.seq++}`,
      feed_type: f.feed_type,
      data: f.data,
      ...(f.ts !== undefined ? { ts: f.ts } : {}),
    }));
    s.streaming.clear();
    // A windowed server read stamps its window; a cache paint / full-history
    // seed passes none and CLEARS any prior stamp — the feed no longer maps to
    // a known server window, so load-older must not trust a stale one.
    s.historyWindow = window;
    this.publish(agentPath, sessionKey, s);
  }

  /**
   * Prepend an OLDER transcript window before the current feed — the
   * scroll-up lazy-load seam (HOU-819). The existing entries (including any
   * open streaming bubble) keep their ids and order; only the new frames are
   * minted. The caller is the same windowed-history reader that seeds, so the
   * frames are final history — never streaming state.
   */
  prependHistory(
    agentPath: string,
    sessionKey: string,
    frames: readonly { feed_type: string; data: unknown; ts?: number }[],
    window: HistoryWindowVM,
  ): void {
    const s = this.state(agentPath, sessionKey);
    s.feed = [
      ...frames.map((f) => ({
        id: `f${s.seq++}`,
        feed_type: f.feed_type,
        data: f.data,
        ...(f.ts !== undefined ? { ts: f.ts } : {}),
      })),
      ...s.feed,
    ];
    s.historyWindow = window;
    this.publish(agentPath, sessionKey, s);
  }

  pushFeedItem(agentPath: string, sessionKey: string, item: unknown): void {
    const s = this.state(agentPath, sessionKey);
    const { feed_type, data, ts, pending, fails_pending } = item as {
      feed_type: string;
      data: unknown;
      ts?: number;
      pending?: boolean;
      fails_pending?: boolean;
    };
    // An optimistic (pending) push is NOT server evidence, so it never confirms a
    // sibling optimistic bubble — two queued prompts both keep their clock. ANY
    // other push resolves EVERY currently pending entry at once: a
    // client-generated send-failure notice (`fails_pending`) FAILS them (clock ->
    // error tick), any real server frame CONFIRMS them (clock -> check).
    if (pending !== true) {
      if (fails_pending === true) this.failPending(s);
      else this.clearPending(s);
    }
    const finalOf = FINAL_OF[feed_type];
    if (feed_type.endsWith("_streaming")) {
      this.upsertStreaming(s, feed_type, data, ts);
    } else if (finalOf !== undefined && s.streaming.has(finalOf)) {
      const id = s.streaming.get(finalOf);
      const entry = s.feed.find((f) => f.id === id);
      if (entry) {
        // Finalizing an open stream mutates the SAME entry: keep its original
        // `ts` (the bubble is timed by when it opened), only swap type + data.
        entry.feed_type = feed_type;
        entry.data = data;
      }
      s.streaming.delete(finalOf);
    } else {
      // A fresh entry: carry a supplied `ts`, else stamp the wall clock now; an
      // optimistic push carries `pending: true` until server evidence clears it.
      s.feed.push({
        id: `f${s.seq++}`,
        feed_type,
        data,
        ts: ts ?? Date.now(),
        ...(pending === true ? { pending: true } : {}),
      });
    }
    this.publish(agentPath, sessionKey, s);
  }

  /**
   * Strip the optimistic `pending` flag off every entry that still carries it —
   * the "confirmed by the engine" signal. Same ids, so a cleared entry is a
   * normal reactive snapshot update (clock -> check), not a re-render. The caller
   * republishes.
   */
  private clearPending(s: ConvState): void {
    for (const entry of s.feed) if (entry.pending) delete entry.pending;
  }

  /**
   * Fail every entry that still carries the optimistic `pending` flag — the
   * "the send provably never landed" signal. Strips `pending` and sets `failed`
   * (same id, a normal reactive update: clock -> error tick), so an undelivered
   * message is never mistaken for a confirmed one. A no-op once server evidence
   * has already cleared `pending` (a delivered turn that later errors), so it
   * only ever bites a send with no evidence. The caller republishes.
   */
  private failPending(s: ConvState): void {
    for (const entry of s.feed)
      if (entry.pending) {
        delete entry.pending;
        entry.failed = true;
      }
  }

  private upsertStreaming(
    s: ConvState,
    feed_type: string,
    data: unknown,
    ts?: number,
  ): void {
    const existingId = s.streaming.get(feed_type);
    if (existingId !== undefined) {
      const entry = s.feed.find((f) => f.id === existingId);
      if (entry) {
        // A streaming delta updates data only — the entry keeps the `ts` it was
        // stamped with when the stream opened.
        entry.data = data;
        return;
      }
    }
    // Opening the stream's entry: carry a supplied `ts`, else stamp now.
    const id = `f${s.seq++}`;
    s.feed.push({ id, feed_type, data, ts: ts ?? Date.now() });
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
    // streaming text starts a fresh bubble instead of extending this one, and it
    // confirms any outstanding optimistic bubble — the turn is over, nothing is
    // still pending.
    if (status === "completed" || status === "error") {
      s.streaming.clear();
      this.clearPending(s);
    }
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
    pendingInteraction?: PendingInteraction | null,
  ): Promise<void> {
    const s = this.state(agentPath, sessionKey);
    s.boardStatus = status;
    // Turn start persists `running` + null (clears); a settle persists the
    // terminal status + the interaction it ended on (or null). An omitted arg
    // clears — no interaction means the card is not waiting on the user.
    s.pendingInteraction = pendingInteraction ?? null;
    this.publish(agentPath, sessionKey, s);
  }

  /**
   * The server confirmed this conversation is idle. A VM still saying
   * "running" is STALE — its stream died without a settle (external teardown
   * keeps live state by design) — so clear the flag; a settled/idle VM is
   * left untouched (the truth is already terminal, and re-publishing would
   * churn subscribers for nothing).
   */
  confirmIdle(agentPath: string, sessionKey: string): void {
    const s = this.state(agentPath, sessionKey);
    if (s.sessionStatus !== "running") return;
    s.sessionStatus = "idle";
    s.streaming.clear();
    this.publish(agentPath, sessionKey, s);
  }

  /**
   * Record the server-transcript window WITHOUT reseeding the feed — the
   * identical-content revalidation path (HOU-819): the windowed read's fold
   * matched what is already on screen, so replacing would only churn entry
   * ids, but load-older still needs to know where the loaded feed starts.
   */
  stampHistoryWindow(
    agentPath: string,
    sessionKey: string,
    window: HistoryWindowVM,
  ): void {
    const s = this.state(agentPath, sessionKey);
    if (
      s.historyWindow?.earliestLoaded === window.earliestLoaded &&
      s.historyWindow?.total === window.total
    ) {
      return;
    }
    s.historyWindow = window;
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
      pendingInteraction: s.pendingInteraction,
      ...(s.queued.length ? { queued: s.queued.map((q) => ({ ...q })) } : {}),
      ...(s.historyWindow ? { historyWindow: { ...s.historyWindow } } : {}),
    };
    const scope = conversationScope(agentPath, sessionKey);
    this.store.publish(scope, snapshot);
    // Every publish makes this the most-recently-published conversation, so the
    // LRU evicts by real activity — the chats a client is working in stay hot.
    this.convs.touch(scope);
  }
}
