import type { ChatMessage } from "@houston/runtime-client";

/** The turn sink's wiring contract — implementation in turn-sink.ts. */
export interface TurnSinkOptions {
  agentPath: string;
  sessionKey: string;
  /**
   * `turn`: we sent the message (streamTurn). `observer`: we merely watch a
   * conversation left running by another page-load/client — the first idle
   * `sync` closes the stream instead of waiting for a turn.
   */
  mode: "turn" | "observer";
  /** Turn mode: the nonce our send carried — its `user` echo names OUR turnId. */
  nonce?: string;
  /** Abort the resumable subscription (the turn settled / nothing to watch). */
  stop: () => void;
  /** Refetch persisted history (the resync settle source). */
  reloadHistory: () => Promise<ChatMessage[]>;
  /**
   * LEGACY-only guard for settle-from-history (servers/histories without turn
   * ids): whether the trailing assistant message really is THE settling turn's
   * reply. Turn mode matches the prompt (weak against two identical prompts in
   * a row); observer mode checks the message count grew. With turn ids the
   * settle matches by id and never consults this.
   */
  historyGuard: (messages: ChatMessage[]) => boolean;
}
