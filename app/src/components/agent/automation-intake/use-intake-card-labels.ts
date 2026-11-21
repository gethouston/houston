import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export interface IntakeCardLabels {
  placeholder: string;
  escapePlaceholder: string;
  send: string;
  skip: string;
  esc: string;
  back: string;
  forward: string;
  dismiss: string;
  collapse: string;
  expand: string;
  recommended: string;
  progress: (current: number, total: number) => string;
}

export function useIntakeCardLabels(): IntakeCardLabels {
  const { t } = useTranslation("chat");
  return useMemo(
    () => ({
      placeholder: t("questionCard.placeholder"),
      escapePlaceholder: t("questionCard.escapePlaceholder"),
      send: t("questionCard.send"),
      skip: t("interaction.skip"),
      esc: t("interaction.esc"),
      back: t("questionCard.back"),
      forward: t("questionCard.forward"),
      dismiss: t("questionCard.dismiss"),
      collapse: t("interaction.collapse"),
      expand: t("interaction.expand"),
      recommended: t("interaction.recommended"),
      progress: (current: number, total: number) =>
        t("questionCard.progress", { current, total }),
    }),
    [t],
  );
}
