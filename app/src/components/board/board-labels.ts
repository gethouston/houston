import type { AIBoardLabels } from "@houston-ai/board";
import type { TFunction } from "i18next";

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
