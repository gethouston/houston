/**
 * When typing in a composer readies the sandbox its send will run in.
 *
 * The gateway holds a prewarmed sandbox about 30 s after the latest request,
 * so a typing session asks once on its first keystroke and then at most every
 * {@link PREWARM_REFRESH_MS} while the person keeps typing: the hold ends 20 to
 * 30 s after their last keystroke. A new chat has no id until its first send,
 * so the id is minted here and handed to that send by
 * {@link DraftPrewarm.claimNewConversationId}. Only a send to the SAME
 * conversation attaches to the sandbox, which is why the two must agree.
 *
 * Package self-references only: the app's node:test runner loads this file
 * through the `@houston/sdk/draft-prewarm` subpath, and node resolves no
 * extensionless relative import.
 */

import {
  missionConversationId,
  recordConversationKind,
} from "@houston/domain/conversation-keys";
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
  now(): number;
  /** A fresh conversation id for a new chat. Must never throw. */
  mintId(): string;
}

/** The typing session one draft slot is in. */
export interface DraftPrewarmSession {
  /** The agent and the chat it targets; either changing starts a new one. */
  target: string;
  sentAt: number;
}

/** {@link DraftPrewarm.state}: plain data, safe to hand across instances. */
export interface DraftPrewarmState {
  sessions: [string, DraftPrewarmSession][];
  pendingIds: [string, string][];
}

/** One SDK instance's typing sessions and the ids minted for new chats. */
export class DraftPrewarm {
  private readonly sessions = new Map<string, DraftPrewarmSession>();
  private readonly pendingIds = new Map<string, string>();
  /** Targets with a prewarm on the wire. Kept apart from the sessions, which
   *  an emptied composer ends while its request may still be out. */
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
      return;
    }
    const conversationId =
      draft.conversationId ??
      missionConversationId(this.pendingId(draft.draftKey));
    // A routine's chat runs on its schedule; nobody's send is coming.
    if (recordConversationKind(conversationId) === "routine") return;
    const target = JSON.stringify([draft.agentId, conversationId]);
    const now = this.ports.now();
    const session = this.sessions.get(draft.draftKey);
    if (this.inFlight.has(target)) return;
    if (session?.target === target && now - session.sentAt < PREWARM_REFRESH_MS)
      return;
    this.sessions.set(draft.draftKey, { target, sentAt: now });
    this.inFlight.add(target);
    try {
      await this.ports.prewarm(conversationId, draft.agentId, pinOf(draft));
    } finally {
      this.inFlight.delete(target);
    }
  }

  /**
   * The id a new chat's first send uses: the one its typing already
   * prewarmed, or a fresh one when nothing was. Forgets it, so the next new
   * chat in the same slot gets its own.
   */
  /**
   * The state a replacement SDK adopts: a hosted bearer rotation rebuilds the
   * SDK while the person may be typing, and a new chat's send must still claim
   * the id its typing prewarmed. A request in flight is not carried: at worst
   * the new instance asks again and the gateway answers `held`.
   */
  state(): DraftPrewarmState {
    return { sessions: [...this.sessions], pendingIds: [...this.pendingIds] };
  }

  /** Takes over `state` for every slot this instance has not typed in. */
  adopt(state: DraftPrewarmState): void {
    for (const [key, session] of state.sessions)
      if (!this.sessions.has(key)) this.sessions.set(key, { ...session });
    for (const [key, id] of state.pendingIds)
      if (!this.pendingIds.has(key)) this.pendingIds.set(key, id);
  }

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
