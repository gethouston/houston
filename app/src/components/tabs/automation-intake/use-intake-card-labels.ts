import { useMemo } from "react";
import { useTranslation } from "react-i18next";

/** The chrome-label bag a {@link ChatInteractionCard} needs (pager, skip/esc,
 *  send, placeholders). */
export interface IntakeCardLabels {
  placeholder: string;
  escapePlaceholder: string;
  send: string;
  skip: string;
  esc: string;
  back: string;
  forward: string;
  dismiss: string;
  recommended: string;
  progress: (current: number, total: number) => string;
}

/**
 * The ChatInteractionCard chrome labels for the scripted intake, reused verbatim
 * from the real ask_user card wiring (the `chat` namespace) so the scripted
 * cards are pixel-alike. Split out of {@link AutomationIntake} so the component
 * stays under the file-size cap.
 */
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
      recommended: t("interaction.recommended"),
      progress: (current: number, total: number) =>
        t("questionCard.progress", { current, total }),
    }),
    [t],
  );
}
