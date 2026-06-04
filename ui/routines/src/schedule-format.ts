/**
 * Small pure formatting helpers shared by the schedule cron + summary code:
 * time parsing/formatting, ordinals, and list joining. No cron logic here.
 */

/** Parse "HH:MM" into { hour, minute }. */
export function parseTime(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(":").map(Number)
  return { hour: h ?? 9, minute: m ?? 0 }
}

/** Format "HH:MM" into a human-readable 12-hour time ("9:00 AM"). */
export function formatTime(time: string): string {
  const { hour, minute } = parseTime(time)
  const ampm = hour >= 12 ? "PM" : "AM"
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  const mm = String(minute).padStart(2, "0")
  return `${h12}:${mm} ${ampm}`
}

/** 1 → "1st", 2 → "2nd", 15 → "15th". */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** ["Mon","Wed","Fri"] → "Mon, Wed and Fri". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ""
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}
