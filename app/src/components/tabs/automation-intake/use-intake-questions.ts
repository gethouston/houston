import { useMemo } from "react";
import { useTranslation } from "react-i18next";

/** One option row for an intake question card. */
export interface IntakeOption {
  id: string;
  label: string;
}

/** The option sets for the intake's three question cards. */
export interface IntakeQuestions {
  fork: IntakeOption[];
  wake: IntakeOption[];
  schedule: IntakeOption[];
}

/**
 * The option sets for the intake's question cards (fork, wake, and the text
 * schedule step). Split out of {@link AutomationIntake} so the component stays
 * under the file-size cap. The schedule set is idea prompts only — the card
 * keeps a free-text row so the user can type any cadence in their own words.
 */
export function useIntakeQuestions(): IntakeQuestions {
  const { t } = useTranslation("routines");
  return useMemo(
    () => ({
      fork: [
        { id: "know", label: t("intake.startKnow") },
        { id: "template", label: t("intake.startTemplate") },
      ],
      wake: [
        { id: "schedule", label: t("wizard.scheduleOptionTitle") },
        { id: "trigger", label: t("wizard.eventOptionTitle") },
        { id: "webhook", label: t("wizard.webhookOptionTitle") },
      ],
      schedule: [
        {
          id: "weekdayMorning",
          label: t("intake.scheduleOptions.weekdayMorning"),
        },
        { id: "onceADay", label: t("intake.scheduleOptions.onceADay") },
        {
          id: "fridayAfternoon",
          label: t("intake.scheduleOptions.fridayAfternoon"),
        },
        { id: "everyHour", label: t("intake.scheduleOptions.everyHour") },
      ],
    }),
    [t],
  );
}
