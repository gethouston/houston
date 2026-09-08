import type { TurnMode } from "@houston/protocol";
import type { HarnessSession } from "../backends/types";
import type { TurnModeRef } from "./turn-mode-context";
import type { ProvidedContext } from "./workspace-context";

/**
 * The Conversation record — the live session plus everything the cache and the
 * turn path track about it (turn queue, the provider/model/backend/mode the
 * session was built on, the executing turn's ids) — and the predicate that says
 * whether it may be evicted.
 */

export type Conversation = {
  session: HarnessSession;
  queue: Promise<unknown>;
  /**
   * The provider/model the live session is currently pointed at. Tracked so a
   * real mid-conversation switch can be detected — on the web the picker applies
   * a switch via `setSettings`, which alone does NOT move the cached session.
   */
  provider: string;
  model: string;
  /**
   * The id of the backend that BUILT the live session (pi by default, `anthropic`
   * for the Claude Agent SDK). A mid-conversation provider switch that crosses a
   * backend boundary must REBUILD the session on the new backend — never forward
   * a foreign model into the live one via `setModel` (that would route an
   * anthropic turn through pi's in-process client, or an openai id through the
   * Claude subprocess). Compared against `backendFor(model.provider).id` each turn.
   */
  backendId: string;
  /**
   * The execution mode the live session was built with ("execute" by default,
   * "plan" for a read-only planning session). A per-turn mode flip that differs
   * from this REBUILDS the session on the same backend — plan and execute need
   * different tool allowlists + system prompts, which are fixed at build time.
   * See `switchModeIfNeeded`.
   */
  mode: TurnMode;
  /**
   * The EXECUTING turn's live-mode ref (set by exec-turn for the turn's
   * duration, cleared when it settles). `POST /conversations/:id/mode` mutates
   * `liveMode.current` so the running turn's tools adopt the user's mid-turn
   * Mode-pill switch at their next decision — Claude Code's shift+tab
   * semantics. Undefined between turns: with no turn running there is nothing
   * to apply live; the next turn's pin carries the mode instead.
   */
  liveMode?: TurnModeRef;
  /**
   * The workspace + user context the session was FIRST built with (HOU-711,
   * cloud). Reused verbatim when a mode/backend switch rebuilds the session, so a
   * conversation keeps its startup context across a plan ⇄ execute flip — matching
   * how it keeps its history; a context edit only lands in a NEW conversation.
   */
  context?: ProvidedContext;
  /**
   * The wire id of the turn EXECUTING right now (undefined between turns).
   * cancelTurn stamps it on the "Stopped by user" terminal frame so the stop
   * settles the turn it actually interrupts, not whatever a client guesses.
   */
  turnId?: string;
  /**
   * The wire id of a turn the user STOPPED (set by `cancelTurn` when it aborts a
   * live turn; read + cleared by `execTurn` after `prompt()` resolves). pi routes
   * an aborted turn down the normal usage path — `prompt()` resolves clean with
   * no provider_error — so this marker is the only trace that the resolution was
   * a stop. execTurn uses it to stamp `stopped: true` on the persisted assistant
   * message (so the stop survives a reload) and to skip the clean `done`.
   */
  stoppedTurnId?: string;
  /**
   * Turns queued-or-running for this conversation (incremented for a turn's
   * whole lifetime by chat.ts `runTurn`, decremented when it settles). `> 0`
   * pins the session against idle/LRU eviction so a session is NEVER disposed
   * from under a queued turn — `turnId` alone would miss a turn parked in the
   * queue behind the workdir lock, whose session is not yet executing.
   */
  pending: number;
};

/**
 * A session cannot be evicted while it has a turn queued or executing — disposing
 * it mid-turn would abort work the user is waiting on. Both signals are checked:
 * `turnId` covers the executing turn, `pending` covers turns still queued.
 */
export const isConvBusy = (conv: Conversation): boolean =>
  (conv.pending ?? 0) > 0 || conv.turnId !== undefined;
