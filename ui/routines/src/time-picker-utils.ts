export type Period = "am" | "pm";

export function is12HourLocale(locale = "en-US"): boolean {
  return (
    new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions()
      .hour12 ?? false
  );
}

export function periodLabels(locale = "en-US"): { am: string; pm: string } {
  const mark = (hour: number) =>
    new Intl.DateTimeFormat(locale, { hour: "numeric", hour12: true })
      .formatToParts(new Date(2000, 0, 1, hour))
      .find((p) => p.type === "dayPeriod")?.value ?? (hour < 12 ? "AM" : "PM");
  return { am: mark(9), pm: mark(21) };
}

export function to12Hour(hour24: number): { hour: number; period: Period } {
  const period: Period = hour24 < 12 ? "am" : "pm";
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour, period };
}

export function from12Hour(hour12: number, period: Period): number {
  const base = hour12 % 12;
  return period === "pm" ? base + 12 : base;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function buildTime(hour24: number, minute: number): string {
  return `${pad2(hour24)}:${pad2(minute)}`;
}

export function hourOptions(twelveHour: boolean): number[] {
  return twelveHour
    ? Array.from({ length: 12 }, (_, i) => i + 1)
    : Array.from({ length: 24 }, (_, i) => i);
}

export function minuteOptions(): number[] {
  return Array.from({ length: 60 }, (_, i) => i);
}

export function centerPadding(
  viewportHeight: number,
  itemHeight: number,
): number {
  return Math.max(0, (viewportHeight - itemHeight) / 2);
}

export function centerScrollTop(
  offsetTop: number,
  viewportHeight: number,
  itemHeight: number,
): number {
  return offsetTop - viewportHeight / 2 + itemHeight / 2;
}
