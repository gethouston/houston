---
name: collect-my-team-updates
description: "Run the weekly update loop without nagging your team yourself. I send the prompt over Slack or email in your voice, collect what comes back, and analyze each update against your active priorities so you can see what's on track, what's drifting, who's blocked, and who didn't answer. Stays dormant with a friendly message if you don't have a team section in your ops info yet."
version: 1
category: Operations
featured: no
image: clipboard
integrations: [gmail, slack]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Collect My Team Updates

Team-facing weekly update loop. Skill dormant for true solo founder  -  moment founder hires 1+ people and lists in operating context, lights up.

## When to use

- "collect this week's updates from the team".
- "are we on track for goals this week".
- "send the Friday reminder and analyze what comes back".

## Connections I need

I run external work through Composio. Before this skill runs I check the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Team chat** (Slack, Microsoft Teams)  -  Required. Best place to send the weekly prompt and read replies.
- **Inbox** (Gmail, Outlook)  -  Optional. Fallback when team members live in email rather than chat.

If no team chat or inbox is connected I stop and ask you to connect your team chat first.

## Information I need

I read your operations context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Team roster**  -  Required. Why I need it: this skill only runs against your declared team, never random contacts. If missing I ask: "Who's on your team right now? Names plus how I should reach each person  -  best is to drop a roster sheet or list them in your operating context."
- **Active priorities**  -  Required. Why I need it: I judge each update against what the company is actually trying to do this quarter. If missing I ask: "What are the 2 to 3 things the company is pushing on this quarter?"
- **Review day**  -  Optional. Why I need it: sets the deadline for replies. If you don't have it I keep going with TBD and use a 48-hour window.
- **Your voice**  -  Optional. Why I need it: the reminder sounds like you, not a bot. If you don't have it I keep going with TBD using a neutral tone  -  best is to connect your inbox so I can sample 20 to 30 sent messages.

## Steps
<!-- houston-workflow:v1 -->

1. **Read `context/operations-context.md`.** If "Key contacts / Team" section absent, empty, or N≤1 (founder only), stop and say:

   > "This skill collects weekly updates from a team. Your operating context doesn't list anyone yet  -  so there's no one to collect from. Run `set-up-my-ops-info` and add a Team section when you hire, then this skill turns on."

   Do NOT run against external contacts not on team list.

2. **Read `config/update-template.md` if present.** Else use default template below.

3. **Send reminders.** For each team member in Team section:
   - `composio search chat` (preferred) or `composio search inbox`  -  execute send-message tool for founder's team-chat provider.
   - Deliver prompt template as DM or thread reply, addressed to that person. Use founder voice per `config/voice.md`.
   - Default template:

     > "Hi {name}  -  weekly update time. Three questions, 2 minutes:
     > (1) What shipped this week? (2) What's blocked, and what do
     > you need from me to unblock? (3) What's next week's biggest
     > bet? Reply here whenever you have 2 minutes  -  due by end of day
     > {reviewDay}."

   **Carve-out from workspace-level hard nos:** skill sends internal team reminders. NOT external communications. External sends still prohibited.

4. **Wait for responses.** User sets window (default: until end of day of `rhythm.json.reviewDay`, or 48h from send if rhythm not configured). If user invokes skill second time same week, consume window-so-far.

5. **Collect responses.** Pull replies from same chat / inbox tool, matched by thread / conversation.

6. **Analyze alignment** with active priorities from `context/operations-context.md`:

   - **On track**  -  shipped items laddering up to active priority.
   - **Drifting**  -  work happening that doesn't ladder.
   - **Blocked**  -  stated blockers, with who expected to unblock.
   - **Silent**  -  team members who didn't respond.

7. **Write** roundup to `updates/{YYYY-MM-DD}-roundup.md` with four sections + "What founder should do" list at bottom (1-3 items: unblock {person} on {thing}, re-scope {project}, recognize {win}).

8. **Atomic writes**  -  `*.tmp` → rename.

9. **Append to `outputs.json`** with `type: "updates"`, status "ready".

10. **Summarize to user**  -  counts (N on track / M drifting / P blocked / Q silent) + top founder-action from roundup.

## Outputs

- `updates/{YYYY-MM-DD}-roundup.md`
- Appends to `outputs.json` with `type: "updates"`.

## What I never do

- **Send reminders to external contacts.** Team section in operating context is allowlist; everyone else external.
- **Modify HRIS / payroll records** on back of collected updates  -  read-only on systems of record.
- **Run if Team section missing.** Stop with "no team yet" message; do not DIY team list from other sources.