import {
  DEFAULT_NEXT_FIRE_LABELS,
  interp,
  type NextFireLabels,
} from "./labels.ts";

export function describeNextFire(
  next: Date,
  timeZone: string,
  now: Date = new Date(),
  labels: NextFireLabels = DEFAULT_NEXT_FIRE_LABELS,
  locale = "en-US",
): { relative: string; absolute: string } {
  const diffMs = next.getTime() - now.getTime();
  const totalSeconds = Math.max(0, Math.round(diffMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  let relative: string;
  if (totalSeconds < 60) relative = labels.lessThanMinute;
  else if (days === 0 && hours === 0)
    relative = interp(labels.inMinutes, { m: minutes });
  else if (days === 0)
    relative = interp(labels.inHoursMinutes, { h: hours, m: minutes });
  else if (days < 7)
    relative = interp(labels.inDaysHours, { d: days, h: hours });
  else relative = interp(labels.inDays, { d: days });

  let dayLabel = labels.soon;
  let timeLabel = "";
  try {
    const dayFmt = new Intl.DateTimeFormat(locale, {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const todayParts = dayFmt.formatToParts(now);
    const nextParts = dayFmt.formatToParts(next);
    const samePart = (t: string) =>
      todayParts.find((p) => p.type === t)?.value ===
      nextParts.find((p) => p.type === t)?.value;

    if (samePart("month") && samePart("day")) {
      dayLabel = labels.today;
    } else {
      const tomorrow = new Date(now.getTime() + 86_400_000);
      const tomorrowParts = dayFmt.formatToParts(tomorrow);
      const sameAs = (t: string) =>
        tomorrowParts.find((p) => p.type === t)?.value ===
        nextParts.find((p) => p.type === t)?.value;
      if (sameAs("month") && sameAs("day")) {
        dayLabel = labels.tomorrow;
      } else if (days < 7) {
        dayLabel =
          nextParts.find((p) => p.type === "weekday")?.value?.toLowerCase() ??
          labels.soon;
      } else {
        const monthDay = nextParts.filter(
          (p) => p.type === "month" || p.type === "day" || p.type === "literal",
        );
        dayLabel = monthDay.map((p) => p.value).join("") || labels.soon;
      }
    }

    timeLabel = new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(next);
  } catch {}

  const absolute = timeLabel
    ? interp(labels.at, { day: dayLabel, time: timeLabel })
    : dayLabel;
  return { relative, absolute };
}
