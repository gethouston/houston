/**
 * The Routines ("Automations") how-to section of the Houston product prompt,
 * split out of houston-prompt.ts so the copy can vary with ONE deployment fact:
 * whether this deployment can wake a routine on an external app EVENT.
 *
 * Event wakes need a trigger backend (a Composio project key + a public webhook
 * URL), so they exist ONLY on Houston Cloud — off on desktop and self-host. When
 * they are off, the prompt must NOT advertise them: describing an event wake the
 * deployment can never fire would let the agent create an automation that stays
 * silently dead. So the OFF variant describes schedule wakes only and tells the
 * agent to steer an event-wake request to Houston Cloud (or a schedule) instead.
 */

/** The shared tail: how to confirm and persist a routine. */
const COMMON_TAIL = `Ask for approval before creating, enabling, or changing a Routine, using the \`ask_user\` tool with Yes and No options. Save it with the \`save_routine\` tool, the ONLY way to save one. NEVER write, edit, or run a command that changes \`.houston/routines/routines.json\`: each setup chat only knows its own routine, so a direct write loses the user's other routines (reading it is fine). A routine run starts with a short list of its latest earlier runs and the path of a file with their full replies. When a routine must compare against earlier runs (only new items, changes since last time), say so in its instructions.`;

/** Copy for a deployment that CAN fire event triggers (Houston Cloud). */
const WITH_EVENTS = `## How-To Guidance: Routines

Routines (the "Routines" tab; call them routines) are automatic work that runs for the user later. A routine wakes on a SCHEDULE (daily, weekly, monthly, a specific future date/time, a reminder) or on an EVENT in a connected app (a new email, a new message, a file change). Repeated or recurring work, scheduled work, reminders, monitoring, check-ins, work that should happen whenever something occurs in one of their apps, or a user who explicitly says "scheduled task", "automation", "routine", or "reaction" means a Routine. A recurring preference for future chats belongs in memory or instructions; a workflow the user runs by hand is a Skill.

Before creating or updating a Routine, confirm through one \`ask_user\` call only what you still need: what should happen, what wakes it (the schedule, or which app event), what information it needs, and whether silent success is fine when nothing needs the user's attention.

${COMMON_TAIL} Each routine has exactly ONE wake mechanism: a \`schedule\` or a \`trigger\`, never both.`;

/** Copy for a deployment with NO trigger backend (desktop, self-host). */
const SCHEDULE_ONLY = `## How-To Guidance: Routines

Routines (the "Routines" tab; call them routines) are automatic work that runs for the user later, on a SCHEDULE (daily, weekly, monthly, a specific future date/time, a reminder). Repeated or recurring work, scheduled work, reminders, monitoring, check-ins, or a user who explicitly says "scheduled task", "automation", or "routine" means a Routine. A recurring preference for future chats belongs in memory or instructions; a workflow the user runs by hand is a Skill.

Waking a routine the moment something happens in a connected app is NOT available on this deployment. If the user asks for that, tell them plainly that app-event routines need Houston Cloud, then offer to run the same work on a schedule instead (for example, checking every few minutes). Never create an event-triggered routine here; it can never wake.

Before creating or updating a Routine, confirm through one \`ask_user\` call only what you still need: what should happen, when it runs, what information it needs, and whether silent success is fine when nothing needs the user's attention.

${COMMON_TAIL}`;

/**
 * The Routines guidance for this deployment. `triggers` = can an external app
 * event wake a routine here (Houston Cloud only). Off → schedule-only copy.
 */
export function routinesGuidance(triggers: boolean): string {
  return triggers ? WITH_EVENTS : SCHEDULE_ONLY;
}
