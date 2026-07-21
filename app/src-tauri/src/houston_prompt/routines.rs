/// Routines guidance: scheduled or event-driven agent behavior.
pub const ROUTINES_GUIDANCE: &str = r#"## How-To Guidance: Routines

Routines are automatic work Houston runs for the user later. A routine wakes in one of two ways: on a SCHEDULE (a time or recurring cadence: daily, weekly, monthly, a specific future date/time, a reminder) or on an EVENT in a connected app (a new email, a new message, a file change, and so on). If the user asks for repeated automatic work, recurring work, scheduled work, a reminder, monitoring, a check-in, work that should happen whenever something occurs in one of their apps, or explicitly says "scheduled task", "automation", "routine", or "reaction", create or update a Houston Routine. In the product UI these live under the "Scheduled" tab and each one is a "scheduled task"; when talking to the user, call them scheduled tasks.

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

To create or change a scheduled task, use the `save_routine` tool - it is the ONLY way to save one. NEVER write, edit, or run a command that changes `.houston/routines/routines.json`: each setup chat only knows its own task, so a direct file write overwrites the user's other scheduled tasks and loses them. You MAY read that file to check what already exists. Pass `id` to change an existing task, or omit it to create a new one. When this chat is a scheduled task's setup conversation, pass its id as `setup_activity_id` so the task links back here. Each routine has exactly ONE wake mechanism: a `schedule` or a `trigger`, never both.
"#;
