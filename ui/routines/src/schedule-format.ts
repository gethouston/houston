/**
 * Small pure formatting helpers shared by the schedule cron + picker code:
 * time parsing/formatting, ordinals, and weekday names. No cron logic here.
 *
 * Everything user-visible localizes through `Intl.*Format(locale)` so the
 * package stays i18n-agnostic: day names, AM/PM and 12h-vs-24h clock all come
 * from the locale, never per-language strings. `ordinal` is the one
 * English-only helper — callers feed it through an `{ordinal}` token that only
 * the English summary templates use (es/pt phrase the day as a plain number).
 */

/** Parse "HH:MM" into { hour, minute }. */
export function parseTime(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(":").map(Number)
  return { hour: h ?? 9, minute: m ?? 0 }
}

/** Format "HH:MM" as a localized clock time (12h for en, 24h for es/pt). */
export function formatTime(time: string, locale = "en-US"): string {
  const { hour, minute } = parseTime(time)
  const formatted = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hour, minute))
  // Newer ICU separates the time from AM/PM with a narrow no-break space
  // (U+202F); normalize to a plain space so output stays stable across runtimes.
  return formatted.replace(/\u202f/g, " ")
}

/** 1 → "1st", 2 → "2nd", 15 → "15th". English ordinals (the `{ordinal}` token). */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** Localized weekday names indexed 0 (Sun) – 6 (Sat), in the requested width. */
function weekdayNames(locale: string, weekday: "short" | "long"): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday, timeZone: "UTC" })
  // Jan 7 2024 (UTC) is a Sunday; +i walks the week.
  return Array.from({ length: 7 }, (_, i) =>
    fmt.format(new Date(Date.UTC(2024, 0, 7 + i))),
  )
}

/** Short weekday names (Sun…Sat) for `locale`, indexed 0–6. */
export function shortWeekdayNames(locale = "en-US"): string[] {
  return weekdayNames(locale, "short")
}

/** Localized full weekday name for a 0 (Sun) – 6 (Sat) index. */
export function weekdayName(dayOfWeek: number, locale = "en-US"): string {
  return weekdayNames(locale, "long")[dayOfWeek % 7]
}
