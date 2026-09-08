import type { TurnMode } from "@houston/protocol";

/**
 * WHICH CONVERSATION EACH AGENT IS WORKING IN, held by the host.
 *
 * A runtime tells the host which conversation its turn belongs to by sending
 * `x-houston-conversation-id`. That is fine for anything the runtime is merely
 * describing to itself, and NOT fine for the two decisions that are about the
 * runtime rather than for it:
 *
 *  - Mission ancestry (`missions-start.ts`). The depth guard asks "is the chat
 *    this call comes from itself a mission?" - a question a caller that names a
 *    conversation of its own invention answers "no" forever, which is exactly
 *    the unbounded spawn loop the guard exists to prevent.
 *  - Plan mode (`assistant-operate.ts`). Plan means the user asked for a
 *    proposal, not for work; a runtime that skipped its own mode check (a bug, a
 *    fork, a prompt-injected turn) must still not have the host act for it.
 *
 * So the host records it instead, at the two places a turn actually begins:
 * the user's send (`routes/agents.ts`) and a programmatic fire - a routine, a
 * trigger, a mission's first turn - which every deployment routes through its
 * channel's `fireTurn` (`channel/proxy.ts`, `channel/turn.ts`). One turn runs
 * per agent at a time, so one record per agent says everything.
 *
 * The record OUTLIVES its turn deliberately: nothing on the host observes a
 * turn ending on every deployment, and a stale record can only ever name the
 * agent's own most recent conversation - the same answer the live turn would
 * give, because the next turn overwrites it before the runtime can call back.
 */
export interface LiveTurn {
  /** The conversation the agent's most recent turn was started in. */
  readonly conversationId: string;
  /**
   * The mode that turn runs under, as the host last saw it set: pinned by the
   * send that started it, then moved by the Mode pill (`POST
   * /conversations/:id/mode`), which the host reads on its way to the runtime.
   */
  readonly mode: TurnMode;
}

class LiveTurnRegistry {
  private readonly turns = new Map<string, LiveTurn>();

  /** A turn is starting for this agent. Replaces whatever it was doing before. */
  start(agentId: string, conversationId: string, mode: TurnMode): void {
    this.turns.set(agentId, { conversationId, mode });
  }

  /**
   * The Mode pill moved while the agent works. Applied only to the conversation
   * it names, so a switch made in one chat never re-labels another one's turn.
   */
  setMode(agentId: string, conversationId: string, mode: TurnMode): void {
    const current = this.turns.get(agentId);
    if (current?.conversationId === conversationId)
      this.turns.set(agentId, { conversationId, mode });
  }

  /** What this agent is working on, or undefined before its first turn. */
  get(agentId: string): LiveTurn | undefined {
    return this.turns.get(agentId);
  }

  /** Drop an agent's record - it was renamed or deleted, so the id is dead. */
  forget(agentId: string): void {
    this.turns.delete(agentId);
  }
}

/**
 * The host's one registry. A singleton for the same reason `assistantApprovals`
 * is: the writer (the route a turn enters through) and the readers (the sandbox
 * routes that turn calls back into) are different request stacks, and what they
 * share is this process.
 */
export const liveTurns = new LiveTurnRegistry();
