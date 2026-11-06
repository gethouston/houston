import {
  type AssistantRuntimeRole,
  readAssistantRole,
} from "@houston/domain/assistant-role";

/** Both backends describe the same planner zones, including custom prompts. */
export function withRoutineTimezone(
  prompt: string,
  timezone?: string,
  role: AssistantRuntimeRole | null = readAssistantRole(),
): string {
  if (role === "coordinator")
    return `${prompt}\n\nEach AI employee's routines run in its own time zone, shown on the employee; write the cron in that zone's local time and never add a time zone to it.`;
  return timezone
    ? `${prompt}\n\nRoutines run in ${timezone}. Write the cron in that local time and never add a time zone to it.`
    : prompt;
}
