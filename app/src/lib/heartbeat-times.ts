/**
 * The times the morning-briefing picker offers: every hour of the day, plus
 * the saved time when it is not on the hour (the AI Manager can set "07:30"
 * for the person), so the picker never shows a value it cannot name.
 */
export function heartbeatTimeOptions(current: string): string[] {
  const hours = Array.from(
    { length: 24 },
    (_, h) => `${String(h).padStart(2, "0")}:00`,
  );
  return hours.includes(current) ? hours : [...hours, current].sort();
}

/** `HH:MM` as the person's locale writes a time of day ("8:00 AM", "08:00"). */
export function formatHeartbeatTime(time: string, locale: string): string {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  // A fixed UTC instant formatted in UTC: only the wall-clock digits matter.
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)));
}
