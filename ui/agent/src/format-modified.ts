const MISSING = "—";

function dayIndex(d: Date): number {
  return Math.floor(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000,
  );
}

export function formatModified(
  mtimeMs: number | undefined,
  now: number,
  locale: string | undefined,
  todayLabel: string,
): string {
  if (!mtimeMs) return MISSING;
  const date = new Date(mtimeMs);
  const today = new Date(now);
  const daysAgo = dayIndex(today) - dayIndex(date);

  if (daysAgo === 0) return todayLabel;
  if (daysAgo >= 1 && daysAgo <= 6) {
    return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
  }
  if (date.getFullYear() === today.getFullYear()) {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
    }).format(date);
  }
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatModifiedFull(
  mtimeMs: number | undefined,
  locale: string | undefined,
): string | undefined {
  if (!mtimeMs) return undefined;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(mtimeMs));
}
