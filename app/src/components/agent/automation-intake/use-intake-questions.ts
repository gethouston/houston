import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export interface IntakeOption {
  id: string;
  label: string;
  description?: string;
}

export interface IntakeQuestions {
  fork: IntakeOption[];
  wake: IntakeOption[];
  schedule: IntakeOption[];
}

export function useIntakeQuestions(): IntakeQuestions {
  const { t } = useTranslation("routines");
  return useMemo(
    () => ({
      fork: [
        { id: "know", label: t("intake.startKnow") },
        { id: "template", label: t("intake.startTemplate") },
      ],
      wake: [
        {
          id: "schedule",
          label: t("wizard.scheduleOptionTitle"),
          description: t("wizard.scheduleOptionDescription"),
        },
        {
          id: "trigger",
          label: t("wizard.eventOptionTitle"),
          description: t("wizard.eventOptionDescription"),
        },
        {
          id: "webhook",
          label: t("wizard.webhookOptionTitle"),
          description: t("wizard.webhookOptionDescription"),
        },
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
