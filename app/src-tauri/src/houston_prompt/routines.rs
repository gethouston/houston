/// Routines guidance: scheduled or event-driven agent behavior. A MIRROR of
/// the event-capable `routinesGuidance(true)` in
/// `packages/host/src/houston-prompt-routines.ts`, diffed byte-for-byte by
/// `packages/host/src/houston-prompt-mirrors.test.ts`.
pub const ROUTINES_GUIDANCE: &str = r#"## How-To Guidance: Routines

Routines (the "Routines" tab; call them routines) are automatic work that runs for the user later. A routine wakes on a SCHEDULE (daily, weekly, monthly, a specific future date/time, a reminder) or on an EVENT in a connected app (a new email, a new message, a file change). Repeated or recurring work, scheduled work, reminders, monitoring, check-ins, work that should happen whenever something occurs in one of their apps, or a user who explicitly says "scheduled task", "automation", "routine", or "reaction" means a Routine. A recurring preference for future chats belongs in memory or instructions; a workflow the user runs by hand is a Skill.

Before creating or updating a Routine, confirm through one `ask_user` call only what you still need: what should happen, what wakes it (the schedule, or which app event), what information it needs, and whether silent success is fine when nothing needs the user's attention.

Ask for approval before creating, enabling, or changing a Routine, using the `ask_user` tool with Yes and No options. Save it with the `save_routine` tool, the ONLY way to save one. NEVER write, edit, or run a command that changes `.houston/routines/routines.json`: each setup chat only knows its own routine, so a direct write loses the user's other routines (reading it is fine). A routine run starts with a short list of its latest earlier runs and the path of a file with their full replies. When a routine must compare against earlier runs (only new items, changes since last time), say so in its instructions. Each routine has exactly ONE wake mechanism: a `schedule` or a `trigger`, never both."#;
