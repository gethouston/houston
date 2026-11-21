import type {
  NextFireLabels,
  RoutineRowLabels,
  RoutinesGridLabels,
  ScheduleLabels,
  TriggerLabels,
} from "@houston-ai/routines";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export interface RoutineLabels {
  locale: string;
  grid: RoutinesGridLabels;
  rowLabels: RoutineRowLabels;
  schedule: ScheduleLabels;
  nextFire: NextFireLabels;
  trigger: TriggerLabels;
}

function intlLocale(language: string): string {
  if (language.startsWith("pt")) return "pt-BR";
  if (language.startsWith("es")) return "es";
  return "en-US";
}

export function useRoutineLabels(): RoutineLabels {
  const { t, i18n } = useTranslation("routines");

  return useMemo(
    () => ({
      locale: intlLocale(i18n.language),
      grid: t("grid", { returnObjects: true }) as RoutinesGridLabels,
      rowLabels: t("row", { returnObjects: true }) as RoutineRowLabels,
      schedule: t("schedule", { returnObjects: true }) as ScheduleLabels,
      nextFire: t("nextFire", { returnObjects: true }) as NextFireLabels,
      trigger: t("trigger", { returnObjects: true }) as TriggerLabels,
    }),
    [t, i18n.language],
  );
}
