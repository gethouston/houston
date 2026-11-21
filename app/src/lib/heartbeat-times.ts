export function heartbeatTimeOptions(current: string): string[] {
  const hours = Array.from(
    { length: 24 },
    (_, h) => `${String(h).padStart(2, "0")}:00`,
  );
  return hours.includes(current) ? hours : [...hours, current].sort();
}

export function formatHeartbeatTime(time: string, locale: string): string {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)));
}
