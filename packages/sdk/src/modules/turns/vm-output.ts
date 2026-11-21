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
import {
  foldReplyPhase,
  type ReplyPhaseState,
  type ReplyPhaseVM,
  replyPhaseField,
} from "./vm-reply-phase";

export interface FeedAuthor {
  userId: string;
  name?: string;
}

export interface FeedMention {
  userId: string;
  name?: string;
}

interface HistoryFrame {
  feed_type: string;
  data: unknown;
  notice?: EngineNoticeKind;
  ts?: number;
  author?: FeedAuthor;
  mentions?: FeedMention[];
  turnId?: string;
  toolIndex?: number;
}

export interface FeedItemVM {
  id: string;
  feed_type: string;
  data: unknown;
  author?: FeedAuthor;
  mentions?: FeedMention[];
  ts?: number;
  pending?: boolean;
  failed?: boolean;
  turnId?: string;
  notice?: EngineNoticeKind;
  toolIndex?: number;
}

export interface QueuedMessageVM {
  id: string;
  text: string;
  attachmentNames?: string[];
}

export interface ConversationVM extends ReplyPhaseVM {
  feed: FeedItemVM[];
  running: boolean;
  sessionStatus: SessionStatusValue | "idle";
  boardStatus: BoardStatus | null;
  pendingInteraction: PendingInteraction | null;
  queued?: QueuedMessageVM[];
  historyWindow?: HistoryWindowVM;
  sendWaiting?: SendWaitReason;
}

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

  forget(agentPath: string, sessionKey: string): void {
    const key = conversationScope(agentPath, sessionKey);
    this.convs.delete(key);
    this.store.clear(key);
  }

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
    } = item as {
      feed_type: string;
      data: unknown;
      notice?: EngineNoticeKind;
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
      !this.upsertByTurn(s, feed_type, data, turnId, toolIndex, notice)
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

  confirmIdle(agentPath: string, sessionKey: string): void {
    const s = this.state(agentPath, sessionKey);
    if (s.sessionStatus !== "running") return;
    s.sessionStatus = "idle";
    s.streaming.clear();
    this.publish(agentPath, sessionKey, s);
  }

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
