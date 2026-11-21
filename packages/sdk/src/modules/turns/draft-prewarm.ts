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

export const PREWARM_REFRESH_MS = 10_000;

export interface ComposerDraft {
  agentId: string;
  draftKey: string;
  conversationId?: string;
  text: string;
  provider?: string;
  model?: string;
}

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
  monotonic?(): number;
  mintId(): string;
}

export interface DraftPrewarmSession {
  target: string;
  sent: DraftInstant;
  held: DraftInstant;
}

export interface DraftPrewarmState {
  sessions: [string, DraftPrewarmSession][];
  pendingIds: [string, string][];
  typing: [string, DraftTypingRun][];
}

export class DraftPrewarm {
  private readonly sessions = new Map<string, DraftPrewarmSession>();
  private readonly pendingIds = new Map<string, string>();
  private readonly typing = new DraftTypingRuns();
  private readonly inFlight = new Set<string>();

  constructor(private readonly ports: DraftPrewarmPorts) {}

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

  state(): DraftPrewarmState {
    return {
      sessions: [...this.sessions],
      pendingIds: [...this.pendingIds],
      typing: this.typing.entries(),
    };
  }

  adopt(state: DraftPrewarmState): void {
    for (const [key, session] of state.sessions)
      if (!this.sessions.has(key)) this.sessions.set(key, session);
    for (const [key, id] of state.pendingIds)
      if (!this.pendingIds.has(key)) this.pendingIds.set(key, id);
    this.typing.adopt(state.typing);
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
