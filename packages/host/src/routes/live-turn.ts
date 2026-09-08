import type { TurnMode } from "@houston/protocol";

/**
 * WHICH CONVERSATION EACH AGENT IS WORKING IN, held by the host.
 *
 * A runtime tells the host which conversation its turn belongs to by sending
 * `x-houston-conversation-id`. That is fine for anything the runtime is merely
 * describing to itself, and NOT fine for the three decisions that are about the
 * runtime rather than for it:
 *
 *  - Mission ancestry (`missions-start.ts`). The depth guard asks "is the chat
 *    this call comes from itself a mission?" - a question a caller that named a
 *    conversation of its own invention answers "no" forever, which is exactly
 *    the unbounded spawn loop the guard exists to prevent.
 *  - Plan mode (`plan-gate.ts`). Plan means the user asked for a proposal, not
 *    for work; a runtime that skipped its own mode check (a bug, a fork, a
 *    prompt-injected turn) must still not have the host act for it.
 *  - WHO the turn acts as (`missions-sandbox.ts`, `learnings-sandbox.ts`,
 *    `routines-sandbox.ts`). A loopback `/sandbox/*` call is not gateway-fronted,
 *    so an acting-as header arriving on one is the runtime's own word about
 *    whose name a mission or a learning is written in.
 *
 * So the host records all three itself, at the two places a turn actually
 * begins: the user's send (`routes/agents.ts`) and a programmatic fire - a
 * routine, a trigger, a mission's first turn - which every deployment routes
 * through its channel's `fireTurn` (`channel/proxy.ts`, `channel/turn.ts`).
 *
 * Records are kept PER CONVERSATION, and the caller has to name the one it is
 * speaking in: two chats with the same agent run their own turns, and a record
 * keyed by the agent alone would let the second send re-label the first turn's
 * mode and lineage. A turn's record is dropped when the runtime reports that
 * turn ending (`/sandbox/missions/settle`), so a call arriving after the work
 * is over is refused rather than served against a turn that no longer runs.
 */
export interface LiveTurn {
  /** The conversation this turn was started in. */
  readonly conversationId: string;
  /**
   * The mode this turn runs under, as the host last saw it set: pinned by the
   * send that started it, then moved by the Mode pill (`POST
   * /conversations/:id/mode`), which the host reads on its way to the runtime.
   */
  readonly mode: TurnMode;
  /**
   * The gateway-minted acting-as token of the person whose action started this
   * turn. Only ever set where a trusted gateway fronts the request that began
   * it; on the desktop an inbound acting header is untrusted client input and
   * nothing is recorded.
   */
  readonly actingAs?: string;
  /**
   * The routine creator's `sub`, for a FIRED ROUTINE - which has no live human,
   * so no acting-as token exists for it. Recorded by the same fire that starts
   * the turn (`channel/proxy.ts`), never taken from the runtime.
   */
  readonly actingUser?: string;
}

/** The identity a turn acts as, as its starter knew it. */
export interface LiveTurnIdentity {
  actingAs?: string | undefined;
  actingUser?: string | undefined;
}

/**
 * The most conversations one agent may hold records for. A runtime runs its
 * turns one at a time, so this is far above any real concurrency; it exists so
 * a host that never sees an end report for some turn cannot accumulate a record
 * per conversation forever. Eviction drops the OLDEST record, which fails
 * closed: the call it would have served is refused as out-of-turn.
 */
const MAX_TURNS_PER_AGENT = 32;

/**
 * One conversation's record plus how many turns are running in it. A person can
 * send again while the agent is still working - the runtime queues the second
 * message behind the first - so the end report for the FIRST turn must not
 * retire the record the second one is running under. Counting the starts and
 * the ends keeps the record alive for exactly as long as work is.
 */
interface LiveTurnEntry {
  turn: LiveTurn;
  running: number;
}

class LiveTurnRegistry {
  private readonly turns = new Map<string, Map<string, LiveTurnEntry>>();

  /** A turn is starting for this agent, in this conversation. */
  start(
    agentId: string,
    conversationId: string,
    mode: TurnMode,
    identity: LiveTurnIdentity = {},
  ): void {
    let byConversation = this.turns.get(agentId);
    if (!byConversation) {
      byConversation = new Map();
      this.turns.set(agentId, byConversation);
    }
    const running = (byConversation.get(conversationId)?.running ?? 0) + 1;
    // Re-inserted so the eviction order below is "least recently started".
    byConversation.delete(conversationId);
    byConversation.set(conversationId, {
      running,
      turn: {
        conversationId,
        mode,
        ...(identity.actingAs ? { actingAs: identity.actingAs } : {}),
        ...(identity.actingUser ? { actingUser: identity.actingUser } : {}),
      },
    });
    while (byConversation.size > MAX_TURNS_PER_AGENT) {
      const oldest = byConversation.keys().next();
      if (oldest.done) break;
      byConversation.delete(oldest.value);
    }
  }

  /**
   * The Mode pill moved while the agent works. Applied only to the conversation
   * it names, so a switch made in one chat never re-labels another one's turn.
   */
  setMode(agentId: string, conversationId: string, mode: TurnMode): void {
    const entry = this.turns.get(agentId)?.get(conversationId);
    if (entry) entry.turn = { ...entry.turn, mode };
  }

  /**
   * This agent's live turn in THIS conversation, or undefined when it has none -
   * which every caller reads as "not in a turn" and refuses.
   */
  get(agentId: string, conversationId: string): LiveTurn | undefined {
    return this.turns.get(agentId)?.get(conversationId)?.turn;
  }

  /**
   * One turn ended (the runtime reported its terminal state). The record goes
   * only when nothing is left running in that conversation.
   */
  end(agentId: string, conversationId: string): void {
    const byConversation = this.turns.get(agentId);
    const entry = byConversation?.get(conversationId);
    if (!byConversation || !entry) return;
    entry.running -= 1;
    if (entry.running > 0) return;
    byConversation.delete(conversationId);
    if (byConversation.size === 0) this.turns.delete(agentId);
  }

  /** Drop an agent's records - it was renamed or deleted, so the id is dead. */
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
