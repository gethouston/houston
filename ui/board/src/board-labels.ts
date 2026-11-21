export interface AIBoardLabels {
  composerPlaceholder?: string;
  followUpPlaceholder?: string;
  newConversationTitle?: string;
}

export const DEFAULT_AI_BOARD_LABELS: Required<AIBoardLabels> = {
  composerPlaceholder: "What should the AI Employee work on?",
  followUpPlaceholder: "Send a follow-up...",
  newConversationTitle: "New conversation",
};

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

export function composerHasHistory(args: {
  asksOpeningWhenEmpty: boolean;
  feedLength: number;
}): boolean {
  return args.asksOpeningWhenEmpty ? args.feedLength > 0 : true;
}
