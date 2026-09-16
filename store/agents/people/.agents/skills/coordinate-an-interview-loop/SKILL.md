---
name: coordinate-an-interview-loop
description: "Schedule a candidate's interview loop  -  find times that work across the panel, draft per-panelist briefs, and hand you the slate to confirm. I never send invites, you do."
version: 1
category: People
featured: no
image: busts-in-silhouette
integrations: [googlecalendar, outlook, loops]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Coordinate an Interview Loop

## When to use

- Explicit: "schedule {candidate}'s loop", "coordinate the panel for {candidate}", "set up interviews for {candidate}", "book the loop".
- Prereq: candidate record exist + passed screening.
- One invocation per candidate loop.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Calendar (Google Calendar, Outlook)** — read free/busy and draft invites. Required.
- **Inbox (Gmail, Outlook, Loops)** — draft outreach to the candidate with the proposed schedule. Optional.

If your calendar isn't connected I stop and ask you to link it from the Integrations tab.

## Information I need

I read your people context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Candidate record** — Required. Why I need it: I won't schedule a loop for a candidate I've never seen. If missing I ask: "Run a screen on this candidate first so I know they've cleared the first pass."
- **Panel** — Required. Why I need it: I need names and emails to check free/busy. If missing I ask: "Who's on the panel? Share names or email addresses."
- **Target window** — Required. Why I need it: I can't search free/busy without one. If missing I ask: "What window are we aiming for, for example next Tuesday through Thursday afternoons?"
- **Per-interview duration** — Required. Why I need it: shapes the slots I look for. If missing I ask: "How long is each interview, 30, 45, or 60 minutes?"
- **Timezone** — Required when panel spans regions. Why I need it: avoids 6 a.m. surprises. If missing I ask: "What timezone should I use as the anchor for the loop?"

## Steps
<!-- houston-workflow:v1 -->

1. **Read people-context doc** at `context/people-context.md`. If missing/empty, tell user: "I need your people context first  -  run the set-up-my-people-info skill." Stop.
2. **Read candidate record** at `candidates/{candidate-slug}.md`. If missing, tell user run `screen-resume` or `score-candidate` first. Stop.
3. **Ask panel + window** if not given  -  ONE question: "Who's on the panel (emails or names) and what's the target window (e.g. 'next Tue-Thu afternoons')? Also  -  expected duration per interview (30 / 45 / 60 min)?"
4. **Discover calendar tool via Composio.** Run `composio search calendar` for calendar slug (Google Calendar / Outlook). No calendar connected → tell user which category to link from Integrations. Stop.
5. **Check free/busy.** Execute tool slug to pull free/busy for every panelist + candidate (if availability shared). Find non-conflicting slots in target window fitting duration. Surface conflicts explicit.
6. **Propose schedule.** Lay out loop as block of back-to-back or spaced interviews, one per panelist, each with proposed start / end / timezone. Candidate need breaks → add them.
7. **Draft invites (never send).** Per slot, draft invite text: title, attendees, duration, location / video link placeholder, description (1-2 sentences tying to role + panelist's focus). Save drafts inline  -  no `send` / `create_event` mutation without founder's explicit confirmation.
8. **Run `prep-an-interviewer` per panelist.** Call once per interviewer so every brief appends to `interview-loops/{candidate-slug}.md`.
9. **Write schedule block.** Append dated `## Loop scheduled  -  {YYYY-MM-DD}` section to `interview-loops/{candidate-slug}.md` with proposed schedule table, draft invites, flagged conflicts. Atomic write (`*.tmp` → rename).
10. **Append to `outputs.json`**  -  `{ id, type: "loop-scheduled", title, summary, path: "interview-loops/{candidate-slug}.md", status: "draft", createdAt, updatedAt }`, atomic write.
11. **Summarize to user**  -  one paragraph: proposed schedule, flagged conflicts, reminder invites are drafts, path to loop file. End with: "Reply `send invites` after reviewing and I'll execute the calendar mutation."

## Never invent

- Never send calendar invite without founder's explicit approval. Drafts only.
- Never invent panelist availability  -  free/busy unreadable (private calendar, no connection) → surface + ask user confirm manually.
- Never infer timezone; ask if unclear.

## Outputs

- `interview-loops/{candidate-slug}.md`  -  schedule + invites appended. Per-interviewer briefs appended via `prep-an-interviewer`.
- Appends to `outputs.json` with type `loop-scheduled`.