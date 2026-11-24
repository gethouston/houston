import {
  missionConversationId,
  recordConversationKind,
} from "@houston/domain/conversation-keys";
import {
  type DraftInstant,
  type DraftTypingRun,
  DraftTypingRuns,
  holdOf,
  PREWARM_TYPING_MS,
} from "@houston/sdk/draft-typing";
import type {
  Capabilities,
  ConversationPrewarmInput,
} from "@houston/wire-types";

/** The least time between two prewarms of one typing session. */
export const PREWARM_REFRESH_MS = 10_000;

/** One composer keystroke, as the typing policy reads it. */
export interface ComposerDraft {
  /** The agent the send goes to (its slug on the hosted gateway). */
  agentId: string;
  /** The composer's draft slot. Each slot types one session at a time. */
  draftKey: string;
  /** The open chat. Absent for a new chat, whose id is minted here. */
  conversationId?: string;
  /** Everything typed so far. */
  text: string;
  /** The pin the composer would send with. */
  provider?: string;
  model?: string;
}

/** The capability snapshot the policy reads; not loaded yet reads as off. */
export type PrewarmCapabilities =
  | Pick<Capabilities, "conversationPrewarm">
  | null
  | undefined;

export interface DraftPrewarmPorts {
  prewarm(
    conversationId: string,
    agentId: string,
    input: ConversationPrewarmInput,
  ): Promise<unknown>;
  /** The wall clock, in milliseconds. */
  now(): number;
  /** Milliseconds on a clock that never goes back, though it may stop while
   *  the machine sleeps; absent, the wall clock stands in. */
  monotonic?(): number;
  /** A fresh conversation id for a new chat. Must never throw. */
  mintId(): string;
}

/** The typing session one draft slot is in. */
export interface DraftPrewarmSession {
  /** The agent and the chat it targets; either changing starts a new one. */
  target: string;
  sent: DraftInstant;
  /** Until when the gateway holds what the last request readied, on each
   *  clock: a keystroke before both refreshes the hold, one after either
   *  starts over (a sleep or a clock set forward ends it early, never late). */
  held: DraftInstant;
}

/** {@link DraftPrewarm.state}: plain data, safe to hand across instances. */
export interface DraftPrewarmState {
  sessions: [string, DraftPrewarmSession][];
  pendingIds: [string, string][];
  typing: [string, DraftTypingRun][];
}

/** One SDK instance's typing sessions and the ids minted for new chats. */
export class DraftPrewarm {
  private readonly sessions = new Map<string, DraftPrewarmSession>();
  private readonly pendingIds = new Map<string, string>();
  private readonly typing = new DraftTypingRuns();
  private readonly inFlight = new Set<string>();

  constructor(private readonly ports: DraftPrewarmPorts) {}

  /**
   * Resolves when no request was made or the request succeeded; rejects with
   * the request's error. A failure is never retried here: the next keystroke
   * past the refresh interval asks again.
   */
  async draftChanged(
    draft: ComposerDraft,
    capabilities: PrewarmCapabilities,
  ): Promise<void> {
    if (capabilities?.conversationPrewarm !== true) return;
    if (draft.text.trim() === "") {
      this.sessions.delete(draft.draftKey);
      this.typing.end(draft.draftKey);
      return;
    }
    const conversationId =
      draft.conversationId ??
      missionConversationId(this.pendingId(draft.draftKey));
    if (recordConversationKind(conversationId) === "routine") return;
    const target = JSON.stringify([draft.agentId, conversationId]);
    const wall = this.ports.now();
    const at: DraftInstant = { wall, mono: this.ports.monotonic?.() ?? wall };
    const run = this.typing.keystroke(draft.draftKey, target, at);
    if (this.inFlight.has(target)) return;
    const session = this.sessions.get(draft.draftKey);
    const same = session?.target === target;
    if (same && at.mono - session.sent.mono < PREWARM_REFRESH_MS) return;
    const refreshing =
      same && at.wall < session.held.wall && at.mono < session.held.mono;
    if (!refreshing && at.mono - run.startedMono < PREWARM_TYPING_MS) return;
    const sent: DraftPrewarmSession = { target, sent: at, held: at };
    this.sessions.set(draft.draftKey, sent);
    this.inFlight.add(target);
    try {
      const answer = await this.ports.prewarm(
        conversationId,
        draft.agentId,
        pinOf(draft),
      );
      const hold = holdOf(answer);
      sent.held = { wall: at.wall + hold, mono: at.mono + hold };
    } finally {
      this.inFlight.delete(target);
    }
  }

  /**
   * The state a replacement SDK adopts: a hosted bearer rotation rebuilds the
   * SDK while the person may be typing, and a new chat's send must still claim
   * the id its typing prewarmed. Sessions are handed over as they are, not
   * copied: a request still in flight on the instance replaced settles the
   * hold its replacement reads. The request itself is not carried; the
   * session's send time keeps the replacement from asking again too soon.
   */
  state(): DraftPrewarmState {
    return {
      sessions: [...this.sessions],
      pendingIds: [...this.pendingIds],
      typing: this.typing.entries(),
    };
  }

  /** Takes over `state` for every slot this instance has not typed in. */
  adopt(state: DraftPrewarmState): void {
    for (const [key, session] of state.sessions)
      if (!this.sessions.has(key)) this.sessions.set(key, session);
    for (const [key, id] of state.pendingIds)
      if (!this.pendingIds.has(key)) this.pendingIds.set(key, id);
    this.typing.adopt(state.typing);
  }

  /**
   * The id a new chat's first send uses: the one its typing already
   * prewarmed, or a fresh one when nothing was. Forgets it, so the next new
   * chat in the same slot gets its own.
   */
  claimNewConversationId(draftKey: string): string {
    const pending = this.pendingIds.get(draftKey);
    this.pendingIds.delete(draftKey);
    return pending ?? this.ports.mintId();
  }

  private pendingId(draftKey: string): string {
    const pending = this.pendingIds.get(draftKey);
    if (pending) return pending;
    const minted = this.ports.mintId();
    this.pendingIds.set(draftKey, minted);
    return minted;
  }
}

function pinOf(draft: ComposerDraft): ConversationPrewarmInput {
  return {
    ...(draft.provider ? { provider: draft.provider } : {}),
    ...(draft.model ? { model: draft.model } : {}),
  };
}
