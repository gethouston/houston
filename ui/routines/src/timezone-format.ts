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
];

export function foldDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function listTimezones(): string[] {
  try {
    const supported = (
      Intl as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    if (supported?.length) return supported;
  } catch {}
  return COMMON_TIMEZONES;
}

export interface ZoneOption {
  id: string;
  display: string;
  city: string;
  region: string;
  offset: string;
  keywords: string[];
}

export function describeZone(id: string): Omit<ZoneOption, "offset"> {
  const segments = id.split("/");
  const city = (segments[segments.length - 1] ?? id).replace(/_/g, " ");
  const region = segments.length > 1 ? segments[0].replace(/_/g, " ") : "";
  const display = id.replace(/_/g, " ");
  const flat = id.replace(/[/_]/g, " ");
  const keywords = Array.from(new Set([flat, city, region].filter(Boolean)));
  return { id, display, city, region, keywords };
}

export function zoneOffset(id: string, now: Date): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", {
      timeZone: id,
      timeZoneName: "shortOffset",
    })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName");
    return part?.value ?? "";
  } catch {
    return "";
  }
}

export function buildZoneOptions(
  accountTimezone: string,
  now: Date,
): ZoneOption[] {
  const ids = listTimezones();
  const withAccount = ids.includes(accountTimezone)
    ? ids
    : [accountTimezone, ...ids];
  return withAccount.map((id) => {
    const base = describeZone(id);
    const offset = zoneOffset(id, now);
    return {
      ...base,
      offset,
      keywords: offset ? [...base.keywords, offset] : base.keywords,
    };
  });
}
