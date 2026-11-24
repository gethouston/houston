import type { PendingInteraction } from "@houston/runtime-client";
import { TurnErrorCode } from "@houston/wire-types";
import { LruCache } from "../../lru";
import type { ScopeStore } from "../../store";
import type {
  BoardPersistOptions,
  BoardStatus,
  FeedOutput,
  SessionStatusValue,
} from "./feed-output";
import type { SendWaitReason } from "./send-busy";
import type { EngineNoticeKind } from "./turn-errors";
import type { FilesNotSavedData } from "./turn-unsaved-notice";
import {
  foldReplyPhase,
  type ReplyPhaseState,
  type ReplyPhaseVM,
  replyPhaseField,
} from "./vm-reply-phase";

/**
 * Who wrote a feed entry, in a MULTIPLAYER deployment: the protocol's
 * `ChatMessage.author`, stamped by the gateway from the acting user. Absent
 * single-player (desktop / self-host never stamp one).
 */
export interface FeedAuthor {
  userId: string;
  name?: string;
}

/**
 * One @mention of a human inside a chat message: the protocol's
 * `ChatMessage.mentions[]` entry. The model only ever saw the plain `@Name`
 * text the user typed — this is the structure the composer resolved alongside
 * it, so a surface can chip the name and a later notifications feature can scan
 * a transcript for its own user id. User turns only.
 */
export interface FeedMention {
  userId: string;
  name?: string;
}

interface HistoryFrame {
  feed_type: string;
  data: unknown;
  notice?: EngineNoticeKind;
  noticeData?: FilesNotSavedData;
  ts?: number;
  author?: FeedAuthor;
  mentions?: FeedMention[];
  turnId?: string;
  toolIndex?: number;
}

/** A single reactive feed entry: a stable id plus the machinery's push payload. */
export interface FeedItemVM {
  id: string;
  feed_type: string;
  data: unknown;
  /**
   * Multiplayer only: who wrote this `user_message`. Carried verbatim from the
   * history fold (`FeedFrame.author`) when a transcript is seeded/prepended,
   * and from `StreamTurnOptions.author` on the optimistic send — so a shared
   * conversation attributes EVERY turn identically on reload and live.
   * Optional/additive: absent in single-player and on every non-user entry; a
   * surface that does not render it simply ignores it.
   */
  author?: FeedAuthor;
  /**
   * The teammates this `user_message` @mentions. Carried verbatim
   * from the history fold (`FeedFrame.mentions`) when a transcript is
   * seeded/prepended, and from `StreamTurnOptions.mentions` on the optimistic
   * send — so a shared conversation chips the same names live and on reload.
   * Optional/additive: absent when the message mentioned nobody and on every
   * non-user entry; a surface that does not render it simply ignores it.
   */
  mentions?: FeedMention[];
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
  /**
   * The turn this entry belongs to — the dedup identity. Carried
   * from the history fold's `FeedFrame.turnId` on seeded entries and from the
   * turn state on live pushes, so a re-delivered copy of a turn's content (a
   * running-sync replay over a seeded feed, a settle re-push after a resync)
   * UPDATES the entry already on screen instead of appending a duplicate.
   * Optional/additive: absent on pre-turn-id transcripts and optimistic sends;
   * entries without it keep the append-only fold.
   */
  turnId?: string;
  /**
   * Why the engine authored this `system_message`, when it did: a surface
   * renders its own copy by kind, `data` being the English default (a restart,
   * a send refused for good). Optional/additive: absent on every other entry.
   */
  notice?: EngineNoticeKind;
  noticeData?: FilesNotSavedData;
  /**
   * This entry's index among its turn's `tool_call`s / `tool_result`s — with
   * {@link turnId}, the identity that pairs a replayed tool row with the entry
   * it duplicates (tool rows are many-per-turn). Optional/additive, tool rows
   * only.
   */
  toolIndex?: number;
}

/** A message queued while a turn runs — rendered in the composer, removable. */
export interface QueuedMessageVM {
  id: string;
  text: string;
  attachmentNames?: string[];
}

/** The reactive snapshot published to the `conversation/<id>` scope. */
export interface ConversationVM extends ReplyPhaseVM {
  feed: FeedItemVM[];
  /** Derived: `sessionStatus === "running"`. The spinner/loading flag. */
  running: boolean;
  sessionStatus: SessionStatusValue | "idle";
  /**
   * The persisted board-card status (the `persistBoardStatus` seam), or `null`
   * before any turn ran. Handled-vs-error lives HERE: `needs_you` = handled /
   * attention (EVERY settled turn that is not a real failure — a clean finish,
   * a turn that ended asking the user for something, a user Stop), `error` = a
   * real failure. A turn never writes `done`; only the user moves a card there.
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
   * may offer/trigger load-older. `total` is the transcript's full
   * message count at the last read.
   */
  historyWindow?: HistoryWindowVM;
  /**
   * A message this client sent is still waiting to start, and why (additive;
   * absent when nothing waits). `busy`: the cloud's shared compute has had no
   * room for it for a while, and the SDK keeps re-sending it. A surface says
   * so in place of its usual thinking line; the turn is still in flight.
   */
  sendWaiting?: SendWaitReason;
}

/** See {@link ConversationVM.historyWindow}. */
export interface HistoryWindowVM {
  earliestLoaded: number;
  total: number;
}

interface ConvState extends ReplyPhaseState {
  feed: FeedItemVM[];
  sessionStatus: SessionStatusValue | "idle";
  boardStatus: BoardStatus | null;
  pendingInteraction: PendingInteraction | null;
  seq: number;
  streaming: Map<string, string>;
  queued: QueuedMessageVM[];
  historyWindow?: HistoryWindowVM;
  sendWaiting?: SendWaitReason;
}

const FINAL_OF: Record<string, string> = {
  assistant_text: "assistant_text_streaming",
  thinking: "thinking_streaming",
};

const STREAMED_AS: Record<string, string> = {
  assistant_text_streaming: "assistant_text",
  thinking_streaming: "thinking",
};

const SINGLETON_TYPES = new Set([
  "assistant_text",
  "thinking",
  "final_result",
  "file_changes",
  "provider_error",
]);

function findLast<T>(
  arr: readonly T[],
  pred: (v: T) => boolean,
): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (v !== undefined && pred(v)) return v;
  }
  return undefined;
}

export const DEFAULT_CONVERSATION_CACHE_MAX = 50;

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
        replyComplete: false,
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
    frames: readonly HistoryFrame[],
    window?: HistoryWindowVM,
  ): void {
    const s = this.state(agentPath, sessionKey);
    s.feed = frames.map((f) => this.mintHistoryEntry(s, f));
    s.streaming.clear();
    s.historyWindow = window;
    this.publish(agentPath, sessionKey, s);
  }

  /**
   * Prepend an OLDER transcript window before the current feed — the
   * scroll-up lazy-load seam. The existing entries (including any
   * open streaming bubble) keep their ids and order; only the new frames are
   * minted. The caller is the same windowed-history reader that seeds, so the
   * frames are final history — never streaming state.
   */
  prependHistory(
    agentPath: string,
    sessionKey: string,
    frames: readonly HistoryFrame[],
    window: HistoryWindowVM,
  ): void {
    const s = this.state(agentPath, sessionKey);
    s.feed = [...frames.map((f) => this.mintHistoryEntry(s, f)), ...s.feed];
    s.historyWindow = window;
    this.publish(agentPath, sessionKey, s);
  }

  private mintHistoryEntry(s: ConvState, f: HistoryFrame): FeedItemVM {
    return {
      id: `f${s.seq++}`,
      feed_type: f.feed_type,
      data: f.data,
      ...(f.ts !== undefined ? { ts: f.ts } : {}),
      ...(f.author !== undefined ? { author: f.author } : {}),
      ...(f.mentions !== undefined ? { mentions: f.mentions } : {}),
      ...(f.turnId !== undefined ? { turnId: f.turnId } : {}),
      ...(f.notice !== undefined ? { notice: f.notice } : {}),
      ...(f.noticeData !== undefined ? { noticeData: f.noticeData } : {}),
      ...(f.toolIndex !== undefined ? { toolIndex: f.toolIndex } : {}),
    };
  }

  pushFeedItem(agentPath: string, sessionKey: string, item: unknown): void {
    const s = this.state(agentPath, sessionKey);
    const {
      feed_type,
      data,
      ts,
      pending,
      fails_pending,
      author,
      mentions,
      turnId,
      toolIndex,
      notice,
      noticeData,
    } = item as {
      feed_type: string;
      data: unknown;
      notice?: EngineNoticeKind;
      noticeData?: FilesNotSavedData;
      ts?: number;
      pending?: boolean;
      fails_pending?: boolean;
      author?: FeedAuthor;
      mentions?: FeedMention[];
      turnId?: string;
      toolIndex?: number;
    };
    if (pending !== true) {
      if (fails_pending === true) this.failPending(s);
      else this.clearPending(s);
    }
    const finalOf = FINAL_OF[feed_type];
    const run =
      finalOf !== undefined ? this.openRun(s, finalOf, turnId) : undefined;
    if (feed_type.endsWith("_streaming")) {
      this.upsertStreaming(s, feed_type, data, ts, turnId);
    } else if (finalOf !== undefined && run !== undefined) {
      run.feed_type = feed_type;
      run.data = data;
      if (turnId !== undefined) run.turnId ??= turnId;
      s.streaming.delete(finalOf);
    } else if (
      !this.upsertByTurn(
        s,
        feed_type,
        data,
        turnId,
        toolIndex,
        notice,
        noticeData,
      )
    ) {
      s.feed.push({
        id: `f${s.seq++}`,
        feed_type,
        data,
        ts: ts ?? Date.now(),
        ...(pending === true ? { pending: true } : {}),
        ...(author !== undefined ? { author } : {}),
        ...(mentions !== undefined ? { mentions } : {}),
        ...(turnId !== undefined ? { turnId } : {}),
        ...(toolIndex !== undefined ? { toolIndex } : {}),
        ...(notice !== undefined ? { notice } : {}),
        ...(noticeData !== undefined ? { noticeData } : {}),
      });
    }
    this.publish(agentPath, sessionKey, s);
  }

  private upsertByTurn(
    s: ConvState,
    feed_type: string,
    data: unknown,
    turnId: string | undefined,
    toolIndex: number | undefined,
    notice: EngineNoticeKind | undefined,
    noticeData?: FilesNotSavedData,
  ): boolean {
    if (turnId === undefined) return false;
    if (feed_type === "system_message" && notice !== undefined) {
      const entry = findLast(
        s.feed,
        (f) =>
          f.turnId === turnId &&
          f.feed_type === feed_type &&
          (f.notice === notice ||
            ((f.notice === TurnErrorCode.TimeLimit ||
              f.notice === TurnErrorCode.TimeLimitUnsaved) &&
              (notice === TurnErrorCode.TimeLimit ||
                notice === TurnErrorCode.TimeLimitUnsaved))),
      );
      if (!entry) return false;
      entry.data = data;
      entry.notice = notice;
      if (noticeData !== undefined) entry.noticeData = noticeData;
      return true;
    }
    if (SINGLETON_TYPES.has(feed_type)) {
      const streaming = FINAL_OF[feed_type];
      const entry = findLast(
        s.feed,
        (f) =>
          f.turnId === turnId &&
          (f.feed_type === feed_type || f.feed_type === streaming),
      );
      if (!entry) return false;
      if (feed_type !== "final_result") {
        entry.feed_type = feed_type;
        entry.data = data;
      }
      return true;
    }
    if (
      (feed_type === "tool_call" || feed_type === "tool_result") &&
      toolIndex !== undefined
    ) {
      const entry = findLast(
        s.feed,
        (f) =>
          f.turnId === turnId &&
          f.feed_type === feed_type &&
          f.toolIndex === toolIndex,
      );
      if (!entry) return false;
      entry.data = data;
      return true;
    }
    return false;
  }

  private clearPending(s: ConvState): void {
    for (const entry of s.feed) if (entry.pending) delete entry.pending;
  }

  private failPending(s: ConvState): void {
    for (const entry of s.feed)
      if (entry.pending) {
        delete entry.pending;
        entry.failed = true;
      }
  }

  private openRun(
    s: ConvState,
    streamingType: string,
    turnId: string | undefined,
  ): FeedItemVM | undefined {
    const id = s.streaming.get(streamingType);
    if (id === undefined) return undefined;
    const entry = s.feed.find((f) => f.id === id);
    if (
      entry !== undefined &&
      (turnId === undefined ||
        entry.turnId === undefined ||
        entry.turnId === turnId)
    ) {
      return entry;
    }
    s.streaming.delete(streamingType);
    return undefined;
  }

  private upsertStreaming(
    s: ConvState,
    feed_type: string,
    data: unknown,
    ts?: number,
    turnId?: string,
  ): void {
    const entry = this.openRun(s, feed_type, turnId);
    if (entry) {
      entry.data = data;
      if (turnId !== undefined) entry.turnId ??= turnId;
      return;
    }
    if (turnId !== undefined) {
      const finalType = STREAMED_AS[feed_type];
      const entry = findLast(
        s.feed,
        (f) =>
          f.turnId === turnId &&
          (f.feed_type === feed_type || f.feed_type === finalType),
      );
      if (entry) {
        entry.data = data;
        s.streaming.set(feed_type, entry.id);
        return;
      }
    }
    const id = `f${s.seq++}`;
    s.feed.push({
      id,
      feed_type,
      data,
      ts: ts ?? Date.now(),
      ...(turnId !== undefined ? { turnId } : {}),
    });
    s.streaming.set(feed_type, id);
  }

  sessionStatus(
    agentPath: string,
    sessionKey: string,
    status: SessionStatusValue,
  ): void {
    const s = this.state(agentPath, sessionKey);
    s.sessionStatus = status;
    s.replyComplete = false;
    if (status === "completed" || status === "error") {
      s.streaming.clear();
      this.clearPending(s);
    }
    this.publish(agentPath, sessionKey, s);
  }

  /**
   * Fold the board-card status into the VM (NOT a no-op — this is the handled-
   * vs-error signal a surface reads alongside `sessionStatus`). The board is a
   * separate SCOPE, so nothing is written there; only the conversation VM's
   * `boardStatus` is updated and republished.
   */
  async persistBoardStatus(
    agentPath: string,
    sessionKey: string,
    status: BoardStatus,
    pendingInteraction?: PendingInteraction | null,
    opts?: BoardPersistOptions,
  ): Promise<void> {
    const s = this.state(agentPath, sessionKey);
    if (foldReplyPhase(s, status, opts))
      return this.publish(agentPath, sessionKey, s);
    s.boardStatus = status;
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
   * identical-content revalidation path: the windowed read's fold
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

  /**
   * The engine echoed our send: give the optimistic user bubble its turn's
   * wire id. The LAST id-less user_message is the one this turn's send pushed
   * (sends are serialized per conversation), so turn-anchored affordances —
   * the edit-and-resend rewind — work on a live conversation
   * without waiting for a history reload to re-fold the transcript.
   */
  stampUserTurn(agentPath: string, sessionKey: string, turnId: string): void {
    const s = this.state(agentPath, sessionKey);
    const bubble = findLast(
      s.feed,
      (f) => f.feed_type === "user_message" && f.turnId === undefined,
    );
    if (!bubble) return;
    bubble.turnId = turnId;
    this.publish(agentPath, sessionKey, s);
  }

  /**
   * Drop the feed tail from the FIRST entry of `turnId` onward — the
   * edit-and-resend rewind, folded optimistically after the
   * server accepted the truncation. Explicit (never left to the next history
   * reseed) because the seed decision deliberately SKIPS a shorter incoming
   * fold — the guard that protects loaded pages would otherwise swallow the
   * rewind and leave the dropped turns on screen. The window stamp is cleared:
   * the feed no longer maps to the last-read server window, so load-older must
   * re-arm from the next authoritative read. Returns false (no publish) when
   * the turn is not in the folded feed.
   */
  truncateFromTurn(
    agentPath: string,
    sessionKey: string,
    turnId: string,
  ): boolean {
    const s = this.state(agentPath, sessionKey);
    const at = s.feed.findIndex((f) => f.turnId === turnId);
    if (at === -1) return false;
    s.feed = s.feed.slice(0, at);
    s.streaming.clear();
    s.pendingInteraction = null;
    s.historyWindow = undefined;
    this.publish(agentPath, sessionKey, s);
    return true;
  }

  sendWaiting(
    agentPath: string,
    sessionKey: string,
    reason: SendWaitReason | null,
  ): void {
    const s = this.state(agentPath, sessionKey);
    if ((s.sendWaiting ?? null) === reason) return;
    s.sendWaiting = reason ?? undefined;
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
      ...(s.sendWaiting ? { sendWaiting: s.sendWaiting } : {}),
      ...replyPhaseField(s),
    };
    const scope = conversationScope(agentPath, sessionKey);
    this.store.publish(scope, snapshot);
    this.convs.touch(scope);
  }
}
