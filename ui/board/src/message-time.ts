export interface MessageTime {
  short: string;
  full: string;
  /** Another year only: shorter forms for a card's narrow time slot, longest
   *  first. The card shows the first that fits; rows with room use `short`. */
  compact?: string[];
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
    value = new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
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
  const wallClock = new Date(at.getTime() - at.getTimezoneOffset() * 60_000);
  const day = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = (day(now) - day(at)) / 86_400_000;
  const full = formatter(locale, {
    dateStyle,
    timeStyle: "short",
  }).format(wallClock);
  let short: string;
  let compact: string[] | undefined;
  const elapsed = now.getTime() - at.getTime();
  if (elapsed < -300_000 || days >= 7) {
    const sameYear = at.getFullYear() === now.getFullYear();
    short = formatter(locale, {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    }).format(wallClock);
    if (!sameYear)
      compact = [
        { month: "short", year: "numeric" } as const,
        { month: "numeric", year: "numeric" } as const,
        { year: "numeric" } as const,
      ].map((options) => formatter(locale, options).format(wallClock));
  } else if (elapsed < 60_000) short = words.now;
  else if (days === 0)
    short = formatter(locale, {
      hour: "numeric",
      minute: "2-digit",
    }).format(wallClock);
  else if (days === 1) short = words.yesterday;
  else
    short = formatter(locale, { weekday: "short" })
      .format(wallClock)
      .replace(/\.$/, "");
  return compact ? { short, full, compact } : { short, full };
}
