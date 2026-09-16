/**
 * The AIBoard composer's own copy (ui/ components are i18n-agnostic and take
 * labels as props). Kept apart from `use-board-labels` so the wording is a
 * plain function of the language and the surface, readable without React.
 */
import type { AIBoardLabels } from "@houston-ai/board";
import type { TFunction } from "i18next";

/**
 * Which chat the composer speaks for. A mission board hands work to an agent
 * the user staffed ("the AI Employee"); the 1-on-1 assistant IS Houston, and
 * asking it what the AI Employee should work on names someone who isn't there.
 */
export type BoardLabelSurface = "board" | "assistant";

export function buildBoardLabels(
  t: TFunction<["board", "chat"]>,
  surface: BoardLabelSurface = "board",
): AIBoardLabels {
  return {
    composerPlaceholder:
      surface === "assistant"
        ? t("board:composer.assistantPlaceholder")
        : t("board:composer.placeholder"),
    followUpPlaceholder: t("board:composer.followUp"),
    newConversationTitle: t("board:panel.newTask"),
  };
}
