export interface MessageTime {
  short: string;
  full: string;
}

export type MessageTimeFormatter = (
  iso: string,
  dateStyle?: "full" | "medium",
) => MessageTime;

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(locale: string, options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify([locale, options]);
  let value = formatters.get(key);
  if (!value) {
    value = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, value);
  }
  return value;
}

/** Local calendar dates keep yesterday stable across daylight-saving changes. */
export function formatMessageTime(
  iso: string,
  locale = "en-US",
  words = { now: "Now", yesterday: "Yesterday" },
  now = new Date(),
  dateStyle: "full" | "medium" = "full",
): MessageTime {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return { short: "", full: "" };
  const day = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = (day(now) - day(at)) / 86_400_000;
  const full = formatter(locale, {
    dateStyle,
    timeStyle: "short",
  }).format(at);
  let short: string;
  const elapsed = now.getTime() - at.getTime();
  if (elapsed < -300_000 || days >= 7)
    short = formatter(locale, {
      month: "short",
      day: "numeric",
      ...(at.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
    }).format(at);
  else if (elapsed < 60_000) short = words.now;
  else if (days === 0)
    short = formatter(locale, {
      hour: "numeric",
      minute: "2-digit",
    }).format(at);
  else if (days === 1) short = words.yesterday;
  else
    short = formatter(locale, { weekday: "short" })
      .format(at)
      .replace(/\.$/, "");
  return { short, full };
}
