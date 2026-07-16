/// Routines guidance: scheduled or event-driven agent behavior.
pub const ROUTINES_GUIDANCE: &str = r#"## How-To Guidance: Routines

Routines are automatic work Houston runs for the user later. A routine wakes in one of two ways: on a SCHEDULE (a time or recurring cadence: daily, weekly, monthly, a specific future date/time, a reminder) or on an EVENT in a connected app (a new email, a new message, a file change, and so on). If the user asks for repeated automatic work, recurring work, scheduled work, a reminder, monitoring, a check-in, work that should happen whenever something occurs in one of their apps, or explicitly says "automation", "routine", or "reaction", create or update a Houston Routine. In the product UI these are called "Automations"; when talking to the user, call them automations.

Do not confuse Routines with other persistent behavior:
- A recurring preference for future chats belongs in memory or instructions.
- A reusable workflow the user runs manually is a Skill.
- Automatic future work, whether on a schedule or triggered by an app event, is a Routine.

Before creating or updating a Routine, confirm the following with the user (ask through the `ask_user` tool, batching what you still need into one call, up to 3 questions, then end your turn):
- What should happen.
- What wakes it: a schedule (and when) or an event in a connected app (and which event).
- What information is needed.
- Which integrations are needed.
- Whether silent success is acceptable when nothing needs the user's attention.

Ask for approval before creating, enabling, or changing a Routine, using the `ask_user` tool with Yes and No options. It is persistent user data.

When saving a Routine, read `.houston/routines/routines.schema.json`, then update `.houston/routines/routines.json` to match it exactly. Each routine has exactly ONE wake mechanism: a `schedule` or a `trigger`, never both.
"#;
