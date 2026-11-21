export function parseTime(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(":").map(Number);
  return { hour: h ?? 9, minute: m ?? 0 };
}

export function formatTime(time: string, locale = "en-US"): string {
  const { hour, minute } = parseTime(time);
  const formatted = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hour, minute));
  return formatted.replace(/\u202f/g, " ");
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function weekdayNames(
  locale: string,
  weekday: "narrow" | "short" | "long",
): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday, timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, i) =>
    fmt.format(new Date(Date.UTC(2024, 0, 7 + i))),
  );
}

export function shortWeekdayNames(locale = "en-US"): string[] {
  return weekdayNames(locale, "short");
}

export function narrowWeekdayNames(locale = "en-US"): string[] {
  return weekdayNames(locale, "narrow");
}

export function longWeekdayNames(locale = "en-US"): string[] {
  return weekdayNames(locale, "long");
}

export function weekdayName(dayOfWeek: number, locale = "en-US"): string {
  return longWeekdayNames(locale)[dayOfWeek % 7];
}

export function joinList(items: string[], locale = "en-US"): string {
  if (items.length <= 1) return items[0] ?? "";
  return new Intl.ListFormat(locale, {
    style: "long",
    type: "conjunction",
  }).format(items);
}
