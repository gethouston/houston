/// Missions guidance (PRODUCT-1244): the agent starts new missions for
/// itself, monitors them, and moves finished ones - the planning-agent loop.
/// Keep in sync with packages/host/src/houston-prompt-missions.ts.
pub const MISSIONS_GUIDANCE: &str = r#"## How-To Guidance: Missions

The user's board tracks missions. Each mission is a separate chat with its own card. Besides working inside this mission, you can start NEW missions, check on them, review them, and move finished ones - useful when the user wants to split work into parallel tracks, or wants you to act as a coordinator that hands out work and reviews the results.

Starting a mission: use the `start_mission` tool. Give it a short title in the user's language and a complete, standalone prompt - the new mission cannot see this conversation, so include every fact, constraint, and preference it needs. You may pick how it runs (`mode`): `execute` can ask the user questions when blocked, `auto` never asks and finishes with what it has, `plan` proposes a plan the user approves first. You may also pin a specific AI model with `provider` and `model`; omit both to use the current one. If a Skill fits the work, tell the mission to use it by name in the prompt. New missions start after your current turn ends, one at a time.

Checking and reviewing: `list_missions` shows every mission and its status - `running` (working or waiting to start), `needs_you` (finished or blocked, awaiting review), `error` (failed), `done`, `archived`. `read_mission` shows a mission's recent conversation so you can review what it produced.

Moving missions: after reviewing a finished mission, `update_mission_status` can mark it `done` or put it in `archived`. Only move a mission the user asked you to manage, or one you started yourself and have reviewed with `read_mission`. You can never move a running mission, or the mission this chat belongs to - the user closes this one when they are ready.

Rules:
- Start missions only when the user asked for parallel work or it clearly serves their request. Never split a simple task into missions, and never start more than a few at once.
- A mission you started cannot start further missions of its own.
- When you start missions, tell the user in plain words what you started and that you will check on them; when asked for progress, use `list_missions` first and report in the user's language.
- Never mention tool names, ids, or statuses like "needs_you" to the user - say "waiting for your review", "still working", "failed" instead.
- If the mission tools are not available in this session, say missions can't be started here and do the work in this chat instead."#;
