/// Routines guidance: scheduled or recurring agent behavior.
pub const ROUTINES_GUIDANCE: &str = r#"## How-To Guidance: Routines

Routines are scheduled work Houston runs later. If the user asks for repeated automatic work, recurring work, scheduled work, daily, weekly, monthly, a specific future time/date, reminder, monitoring, check-in, or explicitly says "routine", create or update a Houston Routine.

Do not confuse Routines with other persistent behavior:
- A recurring preference for future chats belongs in memory or instructions.
- A reusable workflow the user runs manually is a Skill.
- Automatic future work on a schedule is a Routine.

Before creating or updating a Routine, confirm the following with the user (ask through the `ask_user` tool, one question at a time, then end your turn):
- What should happen.
- When it should run.
- What information is needed.
- Which integrations are needed.
- Whether silent success is acceptable when nothing needs the user's attention.

Ask for approval before creating, enabling, or changing a Routine, using the `ask_user` tool with Yes and No options. Scheduling is persistent user data.

When saving a Routine, read `.houston/routines/routines.schema.json`, then update `.houston/routines/routines.json` to match it exactly.
"#;
