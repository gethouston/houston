import type { useTranslation } from "react-i18next";
import { durationParts } from "./compute-usage-model";

/**
 * The Time worked screen's two label formatters: a duration composed from the
 * locale's own templates (never string-concatenated units) and a calendar label
 * for a bucket's UTC start day. Split out of the section so the view stays a
 * render and both formatters read next to each other.
 */

type Translate = ReturnType<typeof useTranslation>["t"];

/** Compose a duration from locale templates ("2h 05m" / "45m" / "<1m"). */
export function formatDuration(t: Translate, ms: number): string {
  const parts = durationParts(ms);
  switch (parts.kind) {
    case "zero":
      return t("timeWorked.duration.zero");
    case "underMinute":
      return t("timeWorked.duration.underMinute");
    case "minutes":
      return t("timeWorked.duration.m", { minutes: parts.minutes });
    case "hoursMinutes":
      return t("timeWorked.duration.hm", {
        hours: parts.hours,
        minutes: parts.minutes,
      });
  }
}

/**
 * Localized calendar label for a bucket's UTC start day. Pinned to UTC because
 * the gateway buckets by UTC day: rendering in the viewer's zone would shift
 * every bar's name by one day west of Greenwich.
 */
export function dayLabel(
  language: string,
  day: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(language, {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}
