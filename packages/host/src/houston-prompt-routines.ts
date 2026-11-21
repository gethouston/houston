const COMMON_TAIL = `When you ask if each run gets its own chat (\`chat_mode\`), use the routine's terms. For email: "Where should I put each new email I handle?" with "A new chat for each email" (per_run, "Each email gets a separate conversation.") or "All in one chat" (shared, "Each email continues the same conversation."). Never ask about "results", "history", or "organizing".

Ask for approval before creating, enabling, or changing a Routine, using the \`ask_user\` tool with Yes and No options. Save it with the \`save_routine\` tool, the ONLY way to save one. NEVER write, edit, or run a command that changes \`.houston/routines/routines.json\`: each setup chat only knows its own routine, so a direct write loses the user's other routines (reading it is fine). A routine run starts with a short list of its latest earlier runs and the path of a file with their full replies. When a routine must compare against earlier runs (only new items, changes since last time), say so in its instructions.`;

const WITH_EVENTS = `## How-To Guidance: Routines

Routines (the "Routines" tab; call them routines) are automatic work that runs for the user later. A routine wakes on a SCHEDULE (daily, weekly, monthly, a specific future date/time, a reminder) or on an EVENT in a connected app (a new email, a new message, a file change). Repeated or recurring work, scheduled work, reminders, monitoring, check-ins, work that should happen whenever something occurs in one of their apps, or a user who explicitly says "scheduled task", "automation", "routine", or "reaction" means a Routine. A recurring preference for future chats belongs in memory or instructions; a workflow the user runs by hand is a Skill.

Before creating or updating a Routine, confirm through one \`ask_user\` call only what you still need: what should happen, what wakes it (the schedule, or which app event), what information it needs, and whether silent success is fine when nothing needs the user's attention.

${COMMON_TAIL} Each routine has exactly ONE wake mechanism: a \`schedule\` or a \`trigger\`, never both.`;

const SCHEDULE_ONLY = `## How-To Guidance: Routines

Routines (the "Routines" tab; call them routines) are automatic work that runs for the user later, on a SCHEDULE (daily, weekly, monthly, a specific future date/time, a reminder). Repeated or recurring work, scheduled work, reminders, monitoring, check-ins, or a user who explicitly says "scheduled task", "automation", or "routine" means a Routine. A recurring preference for future chats belongs in memory or instructions; a workflow the user runs by hand is a Skill.

Waking a routine the moment something happens in a connected app is NOT available on this deployment. If the user asks for that, tell them plainly that app-event routines need Houston Cloud, then offer to run the same work on a schedule instead (for example, checking every few minutes). Never create an event-triggered routine here; it can never wake.

Before creating or updating a Routine, confirm through one \`ask_user\` call only what you still need: what should happen, when it runs, what information it needs, and whether silent success is fine when nothing needs the user's attention.

${COMMON_TAIL}`;

export function routinesGuidance(triggers: boolean): string {
  return triggers ? WITH_EVENTS : SCHEDULE_ONLY;
}
