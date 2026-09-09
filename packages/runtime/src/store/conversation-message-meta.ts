import type {
  ChatMessage,
  TokenUsage,
  ToolCallRecord,
} from "@houston/runtime-client";

/** Optional fields of a persisted user message. */
export interface UserMessageMeta {
  author?: ChatMessage["author"];
  /**
   * The teammates the message @mentions (HOU-944). Structure only: the model
   * ran on the plain "@Name" text either way. Omitted when the message mentions
   * nobody, so a single-player record stays byte-identical to today.
   */
  mentions?: ChatMessage["mentions"];
  /** The turn's wire id (`WireFrame.turnId`) — same on the assistant reply. */
  turnId?: string;
  /**
   * The bubble text to render when it must differ from `content` (the real
   * prompt the model ran on). Presentation-only; persisted so a history reload
   * renders `displayText ?? content`. Omitted when the two are the same string.
   */
  displayText?: string;
}

/** Optional fields of a persisted assistant message. */
export interface AssistantMessageMeta {
  tools?: ToolCallRecord[];
  /** The turn's reasoning text, replayed into the mission log on reload (HOU-717). */
  thinking?: string;
  usage?: TokenUsage | null;
  providerSwitch?: ChatMessage["providerSwitch"];
  compaction?: ChatMessage["compaction"];
  /**
   * Marks the message a `/clear` wrote. It is what the chat replays its
   * boundary divider from, and what `renderReplayPreamble` windows on so the
   * cleared turns are never carried back into a rebuilt session.
   */
  contextCleared?: true;
  providerError?: ChatMessage["providerError"];
  /** Files the turn created/modified (relative paths); omitted when empty. */
  fileChanges?: ChatMessage["fileChanges"];
  /**
   * What the turn ended on — a question / connect the user has to answer, or a
   * pure clean-finish offer. Set ONLY on a clean turn (the caller mirrors the
   * `done`-frame condition). Persisted so a client that missed the live `done`
   * and settles from history still renders the card it would have shown.
   */
  pendingInteraction?: ChatMessage["pendingInteraction"];
  /**
   * Set when the user STOPPED this turn — persisted so the standard "Stopped by
   * user" line survives a history reload and the reload derivation renders the
   * interruption instead of a plain successful finish. Absent on completed
   * turns.
   */
  stopped?: true;
  /**
   * Set by the boot settle (session/settle-interrupted-turns.ts) on the reply
   * it writes for a turn the previous process died on. Never set by a running
   * turn — a turn that ends in-process has a real terminal shape instead.
   */
  interrupted?: ChatMessage["interrupted"];
  /** The turn's wire id (`WireFrame.turnId`) — same as the user message's. */
  turnId?: string;
}
