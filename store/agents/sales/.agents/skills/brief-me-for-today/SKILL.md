---
name: brief-me-for-today
description: "Wake up with a one-screen brief: today's meetings, drafts waiting on your sign-off, the top three moves I'd make today, and your watch list of stalled deals or red customers. Calendar is the anchor; I never invent meetings."
version: 1
category: Sales
featured: no
image: handshake
integrations: [googlecalendar]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Brief Me For Today

One-screen morning brief. Founder read with coffee, know where start.

Derived from Gumloop templates #25 (Personal Assistant) + #29 (Brief me for upcoming day on Google Calendar), generalized to any connected calendar.

## When to use

- "brief me for today" / "brief me for the day" / "morning brief".
- "what's on today".
- Scheduled: morning routine (user-configured in Routines tab).

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Calendar**  -  pull today's meetings (time, title, attendees). Required.
- **Messaging**  -  deliver the brief to Slack if you've set that up. Optional.

If your calendar isn't connected I stop and ask you to connect Google Calendar or Outlook from the Integrations tab.

## Information I need

I read your sales context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your sales playbook**  -  Optional. Why I need it: lets me flag meetings that need prep against your qualification framework. If you don't have it I keep going with TBD and skip the prep flag.
- **Today's calendar**  -  Required. Why I need it: the brief is grounded in your actual day. If missing I ask: "Connect Google Calendar or Outlook so I can pull today's meetings, or paste your day."

## Workflow
<!-- houston-workflow:v1 -->

1. **Read playbook.** Load `context/sales-context.md`. If missing, warn user but continue  -  brief still useful without.

2. **Pull today's calendar.** `composio search calendar` → list today's events. Per event capture: time, title, attendees, description. Flag any with "discovery" / "demo" / "account review" / "renewal" in title as needing prep. If existing `call-prep.md` for meeting, link it.

3. **Build approvals queue.** Read each other agent's `outputs.json`, filter `status: "draft"` created last 48 hours. Group by agent, show title + path.

4. **Identify top-3 moves.** Read yesterday's activity across agents:
   - Any replies classified `INTERESTED` awaiting draft approval?
   - Any deals moved stage yesterday, need follow-up?
   - Any customer health flipped YELLOW/RED overnight?
   - Any leads hit stall threshold overnight?

   Pick 3 highest-leverage. Each gets one-line description + copyable prompt to right agent.

5. **Format brief (one screen, 5 sections max):**

   1. **Today's meetings**  -  time · title · prep status.
   2. **Approvals queue**  -  N drafts awaiting sign-off, grouped by agent.
   3. **Top-3 moves**  -  each copyable one-liner.
   4. **Watch list**  -  stalled deals, red customers, high-value leads past stall threshold.
   5. **Yesterday in numbers**  -  leads added, calls held, deals progressed.

6. **Write atomically.** Write to `briefs/{YYYY-MM-DD}.md.tmp`, then rename. Overwrite any prior same-day brief (one brief per day).

7. **Append to `outputs.json`** (or update existing same-day entry):

   ```json
   {
     "id": "<uuid v4>",
     "type": "brief",
     "title": "Daily brief  -  {YYYY-MM-DD}",
     "summary": "<one-line summary of the 3 moves>",
     "path": "briefs/{YYYY-MM-DD}.md",
     "status": "ready",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>"
   }
   ```

8. **Summarize to user.** 3 moves inline in chat + path. If any meeting needs prep and lacks a prep artifact, suggest running `prep-a-meeting type=call` now.

## Outputs

- `briefs/{YYYY-MM-DD}.md`
- Appends (or updates) `outputs.json` with `type: "brief"`.