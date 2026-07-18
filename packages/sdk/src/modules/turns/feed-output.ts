/**
 * The turn machinery's OUTPUT port — the seam the extraction inverts.
 *
 * The turn/feed machinery (sink, stream runners, settles) folds ONE
 * conversation's wire frames into three kinds of push: a chat FeedItem, a
 * SessionStatus, and a persisted board-card status. Historically those pushes
 * went straight onto the desktop's in-process event bus. That coupling is now
 * inverted — the machinery emits ONLY through {@link FeedOutput}, and the host
 * supplies the implementation: the SDK's built-in conversation-VM fold
 * (`vm-output.ts`), the web adapter's bus bridge, or several at once
 * ({@link MultiplexFeedOutput}). One machinery, any number of outputs.
 *
 * These three methods mirror the original bus seams exactly; the union types
 * are the same ones the desktop UI reacts to, carried along unchanged.
 */

import type { PendingInteraction } from "@houston/runtime-client";

export type { PendingInteraction } from "@houston/runtime-client";

/**
 * The session statuses a streamed turn produces. The desktop reacts to exactly
 * these: `running` drives the spinner/loading flag, `completed` the
 * notification + settle, `error` the failure surface. `starting` exists in the
 * legacy dialect; this machinery never emits it.
 */
export type SessionStatusValue = "starting" | "running" | "completed" | "error";

/**
 * Terminal board-card status, persisted once the turn settles. A clean turn
 * splits on its pending interaction: it ended asking the user for something
 * (ask_user / connect) → `needs_you` and the interaction rides the persist;
 * it ended with nothing outstanding → `done`. A handled non-success (user Stop,
 * logged-out provider) also lands `needs_you` (never carrying an interaction);
 * a real failure is `error`.
 */
export type TerminalBoardStatus = "needs_you" | "error" | "done";

/** Board-card statuses a streamed turn writes: running in flight, then terminal. */
export type BoardStatus = "running" | TerminalBoardStatus;

/**
 * Everything the turn machinery emits for one conversation. An implementation
 * decides where the pushes land (a reactive VM, a UI bus, ...). `pushFeedItem`
 * and `sessionStatus` are fire-and-forget; `persistBoardStatus` is awaited so
 * the runner can settle the board card before the turn returns.
 */
export interface FeedOutput {
  /** One chat FeedItem for this conversation (streaming text, tool call, ...). */
  pushFeedItem(agentPath: string, sessionKey: string, item: unknown): void;
  /** The conversation's session status (spinner / settle / failure). */
  sessionStatus(
    agentPath: string,
    sessionKey: string,
    status: SessionStatusValue,
    error?: string,
  ): void;
  /**
   * Persist the board-card status through the host's (cloud-aware) seam.
   * `pendingInteraction` rides the terminal persist: the interaction a clean
   * turn ended on (drives `needs_you`), or `null` to clear it (turn start, and
   * every settle that carries no interaction). Omitted is treated as `null`.
   */
  persistBoardStatus(
    agentPath: string,
    sessionKey: string,
    status: BoardStatus,
    pendingInteraction?: PendingInteraction | null,
  ): Promise<void>;
  /**
   * The server confirmed this conversation is IDLE (an observer attached and
   * its sync reported no turn in flight). Lets an output reconcile state that
   * says otherwise — a `running` VM whose stream was torn down without a settle
   * (client teardown keeps live state by design) would otherwise stay "running"
   * forever, wedging everything keyed on it (the send queue, the spinner).
   * Optional and additive: outputs with no such state simply omit it.
   */
  confirmIdle?(agentPath: string, sessionKey: string): void;
}

/**
 * Fan every push out to several {@link FeedOutput}s at once. The turn machinery
 * folds each frame ONCE and calls a single output; wrapping N outputs in one
 * multiplexer runs them all with no re-processing — e.g. the SDK's conversation
 * VM plus a host's own sink. `persistBoardStatus` awaits every child.
 */
export class MultiplexFeedOutput implements FeedOutput {
  constructor(private readonly outputs: readonly FeedOutput[]) {}

  pushFeedItem(agentPath: string, sessionKey: string, item: unknown): void {
    for (const o of this.outputs) o.pushFeedItem(agentPath, sessionKey, item);
  }

  sessionStatus(
    agentPath: string,
    sessionKey: string,
    status: SessionStatusValue,
    error?: string,
  ): void {
    for (const o of this.outputs)
      o.sessionStatus(agentPath, sessionKey, status, error);
  }

  async persistBoardStatus(
    agentPath: string,
    sessionKey: string,
    status: BoardStatus,
    pendingInteraction?: PendingInteraction | null,
  ): Promise<void> {
    await Promise.all(
      this.outputs.map((o) =>
        o.persistBoardStatus(agentPath, sessionKey, status, pendingInteraction),
      ),
    );
  }

  confirmIdle(agentPath: string, sessionKey: string): void {
    for (const o of this.outputs) o.confirmIdle?.(agentPath, sessionKey);
  }
}
