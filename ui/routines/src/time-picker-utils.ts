/**
 * Pure helpers for the friendly TimePicker — locale-aware 12h/24h detection,
 * AM/PM markers, and conversion between the stored "HH:MM" (24-hour) value and
 * the hour/minute/period a column picker shows.
 *
 * All localization flows through `Intl` so the package stays i18n-agnostic, and
 * everything here is side-effect free (no React, no DOM) so it can be unit-tested
 * directly. The component in `time-picker.tsx` is the only consumer.
 */

/** A half of the 12-hour clock. */
export type Period = "am" | "pm";

/** Whether `locale` formats clock time as 12-hour (en) vs 24-hour (es/pt). */
export function is12HourLocale(locale = "en-US"): boolean {
  // Asking for an hour part without forcing `hourCycle` lets the locale's own
  // default clock surface through `resolvedOptions().hour12`.
  return (
    new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions()
      .hour12 ?? false
  );
}

/** Localized AM/PM markers for `locale` (e.g. "AM"/"PM", "a. m."/"p. m."). */
export function periodLabels(locale = "en-US"): { am: string; pm: string } {
  const mark = (hour: number) =>
    new Intl.DateTimeFormat(locale, { hour: "numeric", hour12: true })
      .formatToParts(new Date(2000, 0, 1, hour))
      .find((p) => p.type === "dayPeriod")?.value ?? (hour < 12 ? "AM" : "PM");
  return { am: mark(9), pm: mark(21) };
}

/** 24-hour hour (0–23) → 12-hour display hour (1–12) + period. */
export function to12Hour(hour24: number): { hour: number; period: Period } {
  const period: Period = hour24 < 12 ? "am" : "pm";
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour, period };
}

/** 12-hour display hour (1–12) + period → 24-hour hour (0–23). */
export function from12Hour(hour12: number, period: Period): number {
  const base = hour12 % 12; // 12 o'clock maps to 0 within its half
  return period === "pm" ? base + 12 : base;
}

/** Two-digit zero-padded string ("9" → "09"). */
export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Compose a stored "HH:MM" (24-hour) value from its parts. */
export function buildTime(hour24: number, minute: number): string {
  return `${pad2(hour24)}:${pad2(minute)}`;
}

/** Hour options for a column: 1–12 (12h locales) or 0–23 (24h locales). */
export function hourOptions(twelveHour: boolean): number[] {
  return twelveHour
    ? Array.from({ length: 12 }, (_, i) => i + 1)
    : Array.from({ length: 24 }, (_, i) => i);
}

/** Minute options 0–59. */
export function minuteOptions(): number[] {
  return Array.from({ length: 60 }, (_, i) => i);
}

/**
 * Padding for each end of a short picker column so the first and last values can
 * still scroll to the vertical center. Half the leftover viewport, never < 0.
 */
export function centerPadding(
  viewportHeight: number,
  itemHeight: number,
): number {
  return Math.max(0, (viewportHeight - itemHeight) / 2);
}

/**
 * The `scrollTop` that places an item — at `offsetTop` within the (end-padded)
 * scroll content, `itemHeight` tall — at the vertical center of `viewportHeight`.
 * The browser clamps to the scroll range, which is exactly why the end padding
 * is needed for the first/last items to truly center.
 */
export function centerScrollTop(
  offsetTop: number,
  viewportHeight: number,
  itemHeight: number,
): number {
  return offsetTop - viewportHeight / 2 + itemHeight / 2;
}
