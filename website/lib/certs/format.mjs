// Human-readable event dates for certificates, in the attendee's language.
//
//   en -> "August 1, 2026"
//   es -> "1 de agosto de 2026"   (lowercase month, the "de" form)
//
// Locales are pinned explicitly (en-US / es-MX) so the output never depends on
// the build machine's locale, and formatting runs in UTC over a manually parsed
// Y/M/D triple: `new Date("2026-08-01")` is parsed as UTC midnight and would
// render as July 31 for anyone building west of Greenwich.

const DATE_PARTS = { year: "numeric", month: "long", day: "numeric" };

const FORMATTERS = {
  en: new Intl.DateTimeFormat("en-US", { ...DATE_PARTS, timeZone: "UTC" }),
  es: new Intl.DateTimeFormat("es-MX", { ...DATE_PARTS, timeZone: "UTC" }),
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Numeric parts of a plain calendar date.
 *
 * The single validator for `event_date`: the gateway export is remote data and
 * a null, blank or `2026-8-1` value must never reach a template that assumes
 * `YYYY-MM-DD` (a `.split("-")` on a null once failed the whole site build).
 *
 * @param {unknown} isoDate Candidate plain date.
 * @returns {{year: number, month: number, day: number}|null} `null` when the
 *   input is not exactly `YYYY-MM-DD`.
 */
export function isoDateParts(isoDate) {
  const match = ISO_DATE.exec(String(isoDate ?? ""));
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/**
 * Format a plain calendar date for display.
 *
 * @param {string} isoDate Plain date, `YYYY-MM-DD`.
 * @param {"en"|"es"} lang Attendee language; anything else falls back to en.
 * @returns {string} Localized date, or `""` when the input is not a plain date.
 */
export function formatEventDate(isoDate, lang) {
  const parts = isoDateParts(isoDate);
  if (!parts) return "";
  const utcMidnight = Date.UTC(parts.year, parts.month - 1, parts.day);
  return (FORMATTERS[lang] ?? FORMATTERS.en).format(utcMidnight);
}
