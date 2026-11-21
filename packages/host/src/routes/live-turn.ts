import type { TurnLimits, TurnMode } from "@houston/protocol";
import type { LiveTurnPin } from "./live-turn-pin";

export { type LiveTurnPin, liveTurnPin } from "./live-turn-pin";

export interface LiveTurn {
  readonly conversationId: string;
  readonly mode: TurnMode;
  readonly actingAs?: string;
  readonly actingUser?: string;
  readonly pin?: LiveTurnPin;
  readonly limits?: TurnLimits;
}

export interface LiveTurnFacts {
  actingAs?: string | undefined;
  actingUser?: string | undefined;
  limits?: TurnLimits | undefined;
}

const MAX_TURNS_PER_AGENT = 32;

interface LiveTurnEntry {
  turn: LiveTurn;
  running: number;
}

class LiveTurnRegistry {
  private readonly turns = new Map<string, Map<string, LiveTurnEntry>>();

  start(
    agentId: string,
    conversationId: string,
    mode: TurnMode,
    facts: LiveTurnFacts = {},
    pin?: LiveTurnPin,
  ): void {
    let byConversation = this.turns.get(agentId);
    if (!byConversation) {
      byConversation = new Map();
      this.turns.set(agentId, byConversation);
    }
    const running = (byConversation.get(conversationId)?.running ?? 0) + 1;
    byConversation.delete(conversationId);
    byConversation.set(conversationId, {
      running,
      turn: {
        conversationId,
        mode,
        ...(facts.actingAs ? { actingAs: facts.actingAs } : {}),
        ...(facts.actingUser ? { actingUser: facts.actingUser } : {}),
        ...(pin ? { pin } : {}),
        ...(facts.limits ? { limits: facts.limits } : {}),
      },
    });
    while (byConversation.size > MAX_TURNS_PER_AGENT) {
      const oldest = byConversation.keys().next();
      if (oldest.done) break;
      byConversation.delete(oldest.value);
    }
  }

  setMode(agentId: string, conversationId: string, mode: TurnMode): void {
    const entry = this.turns.get(agentId)?.get(conversationId);
    if (entry) entry.turn = { ...entry.turn, mode };
  }

  get(agentId: string, conversationId: string): LiveTurn | undefined {
    return this.turns.get(agentId)?.get(conversationId)?.turn;
  }

  end(agentId: string, conversationId: string): void {
    const byConversation = this.turns.get(agentId);
    const entry = byConversation?.get(conversationId);
    if (!byConversation || !entry) return;
    entry.running -= 1;
    if (entry.running > 0) return;
    byConversation.delete(conversationId);
    if (byConversation.size === 0) this.turns.delete(agentId);
  }

  forget(agentId: string): void {
    this.turns.delete(agentId);
  }
}

export const liveTurns = new LiveTurnRegistry();
