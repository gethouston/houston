import { emitEvent } from "./bus";

/**
 * The two HoustonEvents a streamed turn translates into: `FeedItem` (chat
 * content) and `SessionStatus` (spinner / notification / loading flag). Shared
 * by the turn sink and the stream runners so both speak the exact same bus
 * dialect the desktop UI already consumes.
 */

/**
 * The session statuses the desktop UI reacts to (`use-session-events.ts`
 * switches on exactly these): `running` drives the spinner/loading flag,
 * `completed` the notification + settle, `error` the failure surface.
 * `starting` exists in the legacy dialect; this adapter never emits it.
 */
export type SessionStatusValue = "starting" | "running" | "completed" | "error";

/** Terminal board-card status, persisted by the runner once the turn settles. */
export type TerminalBoardStatus = "needs_you" | "error";

/** Board-card statuses a streamed turn writes: running in flight, then terminal. */
export type BoardStatus = "running" | TerminalBoardStatus;

export function feed(
  agentPath: string,
  sessionKey: string,
  item: unknown,
): void {
  emitEvent("FeedItem", {
    agent_path: agentPath,
    session_key: sessionKey,
    item,
  });
}

export function sessionStatus(
  agentPath: string,
  sessionKey: string,
  status: SessionStatusValue,
  error?: string,
): void {
  emitEvent("SessionStatus", {
    agent_path: agentPath,
    session_key: sessionKey,
    status,
    error,
  });
}

/**
 * Persist a board-card status through the injected (cloud-aware) seam the board
 * READS from. A failed persist surfaces in the feed — never swallowed (the card
 * would silently hang in "running" otherwise).
 */
export async function persistBoardStatus(
  agentPath: string,
  sessionKey: string,
  setActivityStatus: (status: BoardStatus) => Promise<void>,
  status: BoardStatus,
): Promise<void> {
  try {
    await setActivityStatus(status);
  } catch (e) {
    feed(agentPath, sessionKey, {
      feed_type: "system_message",
      data: `Couldn't update the board status: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}
