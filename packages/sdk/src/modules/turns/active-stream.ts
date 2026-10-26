/**
 * One live subscription per conversation, whoever opened it: a turn we sent
 * (`streamTurn`) or a passive observer (`observeConversation`). The registry
 * keeps the two from double-subscribing — duplicate streams would render
 * every frame twice.
 */
export interface ActiveStream {
  kind: "turn" | "observer";
  dispose: () => void;
  /** Last seen envelope seq — the observer→turn handoff cursor. */
  lastSeq?: number;
  /** Agent progress for held sends, never a transport heartbeat or refusal. */
  lastProgressAt?: number;
  /**
   * A turn whose send waits behind another turn or for room (`send-hold.ts`):
   * the queue watchdog never flushes over it.
   */
  held?: boolean;
  /**
   * The engine took this turn's send (its 202). Until then the host may not
   * hold the prompt, so a history read sent meanwhile may predate it.
   */
  accepted?: boolean;
  /**
   * Stop a turn whose send the engine has not accepted yet (held, or waiting
   * for room): its POST and re-sends end at once. It answers the `finish` to
   * call once the engine's own cancel answered, when the turn then settles as
   * stopped; null once the send was accepted (the engine's cancel stops it).
   */
  stopUnsent?: () => (() => void) | null;
}

export const streamKey = (agentPath: string, sessionKey: string): string =>
  JSON.stringify([agentPath, sessionKey]);
