import type {
  NextFireLabels,
  RoutineRowLabels,
  RoutinesGridLabels,
  ScheduleLabels,
} from "@houston-ai/routines";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

/**
 * Builds the localized label objects the `@houston-ai/routines` components take.
 * The package stays i18n-agnostic (library boundary): it exposes `labels` props
 * with English defaults, and this hook feeds it `t()` results.
 *
 * The label values carry `{token}` placeholders (single brace) that the package
 * interpolates with computed numbers/times — i18next leaves them intact because
 * we read them with `returnObjects` and pass no interpolation values here.
 */
export interface RoutineLabels {
  /** BCP-47 locale for day names + time formatting inside the components. */
  locale: string;
  grid: RoutinesGridLabels;
  rowLabels: RoutineRowLabels;
  schedule: ScheduleLabels;
  nextFire: NextFireLabels;
}

/** Map the app's base locale tag to a region the formatters should use. */
function intlLocale(language: string): string {
  if (language.startsWith("pt")) return "pt-BR"; // Brazilian Portuguese
  if (language.startsWith("es")) return "es"; // Latin-American neutral
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
    }),
    [t, i18n.language],
  );
}
