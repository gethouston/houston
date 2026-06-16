/**
 * Pure timezone metadata for the account-wide picker.
 *
 * Kept JSX-free (mirrors `schedule-format.ts`) so the parsing/keyword logic is
 * unit-testable under `node --test`. `TimezonePicker` layers the combobox UI on
 * top of `buildZoneOptions`.
 *
 * The IANA id is the stored value; everything else here is derived for display
 * and search: a humanized city/region, the current UTC offset, and the keyword
 * set cmdk matches a query against.
 */

/** Curated fallback when `Intl.supportedValuesOf("timeZone")` is unavailable. */
const COMMON_TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Bogota",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Berlin",
  "Europe/Athens",
  "Africa/Lagos",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
]

/**
 * Strip combining accents so search is accent-insensitive: "São Paulo" folds to
 * "Sao Paulo". cmdk's scorer normalizes case + whitespace but NOT diacritics, so
 * an es/pt user typing the accented form would otherwise match nothing. The
 * combobox folds both the query and each item before scoring.
 */
export function foldDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "")
}

/** Every IANA zone the platform knows, or the curated fallback. */
export function listTimezones(): string[] {
  try {
    const supported = (
      Intl as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf?.("timeZone")
    if (supported && supported.length) return supported
  } catch {
    // fall through to the curated list
  }
  return COMMON_TIMEZONES
}

export interface ZoneOption {
  /** IANA id, e.g. "America/New_York". The persisted value. */
  id: string
  /** Canonical path shown to the user, underscores spaced ("America/New York"). */
  display: string
  /** Last path segment, underscores spaced ("New York"). */
  city: string
  /** First path segment ("America"); empty for single-segment ids ("UTC"). */
  region: string
  /** Current `GMT±HH:MM`, or "" when the platform can't format it. */
  offset: string
  /** Extra terms cmdk matches a query against (beyond the id itself). */
  keywords: string[]
}

/**
 * Split an IANA id into a human city/region plus the keyword set used for
 * search. Pure and offset-free so it's deterministic to test; `buildZoneOptions`
 * adds the runtime offset.
 */
export function describeZone(id: string): Omit<ZoneOption, "offset"> {
  const segments = id.split("/")
  const city = (segments[segments.length - 1] ?? id).replace(/_/g, " ")
  const region = segments.length > 1 ? segments[0].replace(/_/g, " ") : ""
  // Keep the full region/city path for display ("America/New York"); only swap
  // underscores for spaces so it reads cleanly without losing context.
  const display = id.replace(/_/g, " ")
  // The flattened id lets "america new york" match "America/New_York", and
  // keeps middle segments ("Argentina") searchable.
  const flat = id.replace(/[/_]/g, " ")
  const keywords = Array.from(new Set([flat, city, region].filter(Boolean)))
  return { id, display, city, region, keywords }
}

/** Current `GMT±HH:MM` for a zone at `now`, or "" if it can't be formatted. */
export function zoneOffset(id: string, now: Date): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", {
      timeZone: id,
      timeZoneName: "shortOffset",
    })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")
    return part?.value ?? ""
  } catch {
    return ""
  }
}

/**
 * Full selectable-zone list, with the account zone guaranteed present (even if
 * the platform omits it) and each entry carrying its current offset + keywords.
 */
export function buildZoneOptions(
  accountTimezone: string,
  now: Date,
): ZoneOption[] {
  const ids = listTimezones()
  const withAccount = ids.includes(accountTimezone)
    ? ids
    : [accountTimezone, ...ids]
  return withAccount.map((id) => {
    const base = describeZone(id)
    const offset = zoneOffset(id, now)
    return {
      ...base,
      offset,
      keywords: offset ? [...base.keywords, offset] : base.keywords,
    }
  })
}
