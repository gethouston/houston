export interface MessageTime {
  short: string;
  full: string;
}

export type MessageTimeFormatter = (iso: string) => MessageTime;

/** Local calendar dates keep yesterday stable across daylight-saving changes. */
export function formatMessageTime(
  iso: string,
  locale = "en-US",
  words = { now: "Now", yesterday: "Yesterday" },
  now = new Date(),
): MessageTime {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return { short: "", full: "" };
  const day = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = (day(now) - day(at)) / 86_400_000;
  const full = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(at);
  let short: string;
  if (now.getTime() - at.getTime() < 60_000) short = words.now;
  else if (days <= 0)
    short = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
    }).format(at);
  else if (days === 1) short = words.yesterday;
  else if (days <= 6)
    short = new Intl.DateTimeFormat(locale, { weekday: "short" })
      .format(at)
      .replace(/\.$/, "");
  else
    short = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      ...(at.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
    }).format(at);
  return { short, full };
}
