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

/** The shared tail: how to classify, confirm, and persist a routine. */
const COMMON_TAIL = `Ask for approval before creating, enabling, or changing a Routine, using the \`ask_user\` tool with Yes and No options. It is persistent user data.

To create or change a routine, use the \`save_routine\` tool - it is the ONLY way to save one. NEVER write, edit, or run a command that changes \`.houston/routines/routines.json\`: each setup chat only knows its own routine, so a direct file write overwrites the user's other routines and loses them. You MAY read that file to check what already exists. Pass \`id\` to change an existing routine, or omit it to create a new one. When this chat is a routine's setup conversation, pass its id as \`setup_activity_id\` so the routine links back here.`;

/** Copy for a deployment that CAN fire event triggers (Houston Cloud). */
const WITH_EVENTS = `## How-To Guidance: Routines

Routines are automatic work Houston runs for the user later. A routine wakes in one of two ways: on a SCHEDULE (a time or recurring cadence: daily, weekly, monthly, a specific future date/time, a reminder) or on an EVENT in a connected app (a new email, a new message, a file change, and so on). If the user asks for repeated automatic work, recurring work, scheduled work, a reminder, monitoring, a check-in, work that should happen whenever something occurs in one of their apps, or explicitly says "scheduled task", "automation", "routine", or "reaction", create or update a Houston Routine. In the product UI these live under the "Routines" tab and each one is a "routine"; when talking to the user, call them routines.

Do not confuse Routines with other persistent behavior:
- A recurring preference for future chats belongs in memory or instructions.
- A reusable workflow the user runs manually is a Skill.
- Automatic future work, whether on a schedule or triggered by an app event, is a Routine.

Before creating or updating a Routine, confirm the following with the user (ask through the \`ask_user\` tool, batching what you still need into one call, up to 3 questions, then end your turn):
- What should happen.
- What wakes it: a schedule (and when) or an event in a connected app (and which event).
- What information is needed.
- Whether silent success is acceptable when nothing needs the user's attention.

${COMMON_TAIL} Each routine has exactly ONE wake mechanism: a \`schedule\` or a \`trigger\`, never both.`;

/** Copy for a deployment with NO trigger backend (desktop, self-host). */
const SCHEDULE_ONLY = `## How-To Guidance: Routines

Routines are automatic work Houston runs for the user later. On this deployment a routine wakes on a SCHEDULE: a time or recurring cadence (daily, weekly, monthly, a specific future date/time, a reminder). If the user asks for repeated automatic work, recurring work, scheduled work, a reminder, monitoring, a check-in, or explicitly says "scheduled task", "automation", or "routine", create or update a Houston Routine. In the product UI these live under the "Routines" tab and each one is a "routine"; when talking to the user, call them routines.

Waking a routine the moment something happens in a connected app (a new email arriving, a new message) is NOT available on this deployment. If the user asks for that, tell them plainly that app-event routines need Houston Cloud, then offer to run the same work on a schedule instead (for example, checking every few minutes). Never create an event-triggered routine here; it can never wake.

Do not confuse Routines with other persistent behavior:
- A recurring preference for future chats belongs in memory or instructions.
- A reusable workflow the user runs manually is a Skill.
- Automatic future work on a schedule is a Routine.

Before creating or updating a Routine, confirm the following with the user (ask through the \`ask_user\` tool, batching what you still need into one call, up to 3 questions, then end your turn):
- What should happen.
- When it runs: the schedule (a time or recurring cadence).
- What information is needed.
- Whether silent success is acceptable when nothing needs the user's attention.

${COMMON_TAIL} Each routine wakes on a \`schedule\`.`;

/**
 * The Routines guidance for this deployment. `triggers` = can an external app
 * event wake a routine here (Houston Cloud only). Off → schedule-only copy.
 */
export function routinesGuidance(triggers: boolean): string {
  return triggers ? WITH_EVENTS : SCHEDULE_ONLY;
}
