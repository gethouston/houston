/**
 * Copy AIBoard renders itself, rather than forwarding from a prop or a child
 * package's own label bundle. `ui/` is i18n-agnostic: every entry is a flat
 * string with an English default, and the app passes its `t()` results.
 */
export interface AIBoardLabels {
  /** Composer placeholder before the conversation exists (the first message
   *  is what creates it). */
  composerPlaceholder?: string;
  /** Composer placeholder once a conversation is open. */
  followUpPlaceholder?: string;
  /** Detail-panel title while the conversation is still uncreated. Only
   *  surfaces on a mount that passes no `panelAgentName`. */
  newConversationTitle?: string;
}

export const DEFAULT_AI_BOARD_LABELS: Required<AIBoardLabels> = {
  composerPlaceholder: "What should the AI Employee work on?",
  followUpPlaceholder: "Send a follow-up...",
  newConversationTitle: "New conversation",
};

/**
 * The placeholder the composer wears. "Follow-up" is the wording of a
 * conversation that has already had a turn: a session that is open but empty
 * (the 1-on-1 assistant always has one) still asks the opening question, so the
 * caller passes the same emptiness that decides the chat's empty state — the
 * two must agree, or the empty state invites a first message the placeholder
 * calls a follow-up. `hasHistory` defaults to true so a board whose feed is
 * loaded reads as it always has.
 */
export function composerPlaceholder(args: {
  activeSessionKey: string | null;
  hasHistory?: boolean;
  labels?: AIBoardLabels;
}): string {
  const { activeSessionKey, hasHistory = true, labels } = args;
  if (activeSessionKey && hasHistory) {
    return (
      labels?.followUpPlaceholder ?? DEFAULT_AI_BOARD_LABELS.followUpPlaceholder
    );
  }
  return (
    labels?.composerPlaceholder ?? DEFAULT_AI_BOARD_LABELS.composerPlaceholder
  );
}

/**
 * Whether the composer treats the open conversation as having history. Most
 * boards answer yes the moment a conversation is open: the card the user
 * clicked IS the history, and the feed behind it may still be loading. A
 * surface whose conversation is permanent (the assistant) opts in to reading
 * the feed instead, so an empty chat asks its opening question.
 */
export function composerHasHistory(args: {
  asksOpeningWhenEmpty: boolean;
  feedLength: number;
}): boolean {
  return args.asksOpeningWhenEmpty ? args.feedLength > 0 : true;
}
