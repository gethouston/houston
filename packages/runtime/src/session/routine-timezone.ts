/** Both backends describe the same planner zone, including custom prompts. */
export function withRoutineTimezone(prompt: string, timezone?: string): string {
  return timezone
    ? `${prompt}\n\nRoutines run in ${timezone}. Write the cron in that local time and never add a time zone to it.`
    : prompt;
}
