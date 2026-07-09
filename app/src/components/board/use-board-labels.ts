import type { AIBoardProps } from "@houston-ai/board";
import { useTranslation } from "react-i18next";

/**
 * Translated label bundles AIBoard needs that are identical for both board
 * views: the per-card action tooltips + delete confirm, and the composer's
 * file-drop / paste notices. The per-agent select tooltip is always included
 * (a no-op for views without multi-select).
 */
export function useBoardLabels(): {
  cardLabels: AIBoardProps["cardLabels"];
  composerLabels: AIBoardProps["composerLabels"];
} {
  const { t } = useTranslation(["board", "chat"]);
  return {
    cardLabels: {
      approve: t("board:cardActions.approve"),
      approveTooltip: t("board:cardActions.approveTooltip"),
      renameTooltip: t("board:cardActions.renameTooltip"),
      deleteTooltip: t("board:cardActions.deleteTooltip"),
      deleteTitle: (name: string) =>
        t("board:deleteCard.titleWithName", { name }),
      deleteDescription: t("board:deleteCard.description"),
      selectTooltip: t("board:cardActions.select"),
      people: t("board:people.label"),
      peopleExpand: t("board:people.expand"),
    },
    composerLabels: {
      fileAlreadyInChat: t("chat:composer.fileAlreadyInChat"),
      dropTitle: t("chat:composer.dropTitle"),
      dropDescription: t("chat:composer.dropDescription"),
      imagePasteUnavailable: t("chat:composer.imagePasteUnavailable"),
    },
  };
}
