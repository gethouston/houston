---
name: brief-me
description: "Get the brief you need to walk into your day or your meeting prepared. Pick what you need: a daily roll-up of your inbox, calendar, chat, and recent docs into today's plan; a deep attendee pre-read for an upcoming meeting with agenda and likely asks; or post-meeting notes that turn a transcript into decisions, owners, and follow-ups."
version: 1
category: Operations
featured: yes
image: clipboard
integrations: [googledrive, googlecalendar, gmail, outlook, gong, fireflies, slack, linkedin]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Brief Me

One primitive for daily-rhythm briefs anchoring week. You pick `mode`; I aggregate, prioritize, write.

## When to use

- `mode=daily`  -  "morning brief" / "what needs me today" / "here's my brain dump" / "today's rundown".
- `mode=meeting-pre`  -  "prep me for my 2pm" / "deep brief for my meeting with {X}" / "build me a pre-read".
- `mode=meeting-post`  -  "post-meeting notes from my last recording" / "summarize the call I just had with {X}".

## Connections I need

I run external work through Composio. Before this skill runs I check the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Inbox** (Gmail, Outlook)  -  Required. Pulls last-24h threads for the daily brief and prior threads for meeting prep.
- **Calendar** (Google Calendar, Outlook)  -  Required. Reads today's meetings and resolves which one to prep for.
- **Team chat** (Slack)  -  Optional. Adds chat signal to the daily brief; skipped if not connected.
- **Files** (Google Drive)  -  Optional. Surfaces recent doc activity for the daily brief.
- **Meeting recorder** (Fireflies, Gong)  -  Required for `mode=meeting-post`. If not connected I accept a pasted transcript instead.
- **Web research** (LinkedIn, Exa)  -  Optional. Fills in attendee bios for meeting prep.

If neither inbox nor calendar is connected I stop and ask you to connect your calendar first.

## Information I need

I read your operations context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Operating context doc**  -  Required. Why I need it: anchors priorities, VIPs, and hard nos so I don't invent them. If missing I ask: "Want me to set up your operating context first? Takes a few minutes and every brief gets sharper after."
- **Your timezone**  -  Required. Why I need it: keeps the brief inside your working hours. If missing I ask: "What timezone do you work in most of the time?"
- **Who your VIPs are**  -  Required for meeting prep. Why I need it: shapes how deeply I research an attendee. If missing I ask: "Who are the people whose meetings always deserve extra prep  -  investors, key customers, anyone else?"
- **Brief delivery time**  -  Optional. Why I need it: lets the brief auto-trigger at the right hour. If you don't have it I keep going with TBD and run on demand.

## Parameter: `mode`

- `daily`  -  aggregate last 24h across inbox (Gmail / Outlook), calendar (Google Calendar / Outlook), team chat (Slack), recent drive activity (Google Drive) into today's plan. Writes `briefs/{YYYY-MM-DD}.md`.
- `meeting-pre`  -  deep attendee intel for ONE upcoming meeting: bio, role, prior email threads, recent public activity, shared history, suggested agenda, what they'll likely want. Writes `meetings/{YYYY-MM-DD}-{slug}-pre.md`.
- `meeting-post`  -  transcript (Fireflies / Gong) → decisions + owners + follow-ups + verbatim quotes worth keeping. Writes `meetings/{YYYY-MM-DD}-{slug}-post.md`.

## Steps
<!-- houston-workflow:v1 -->

1. Read `config/context-ledger.json`. Missing required field for chosen mode → ask ONE targeted question with modality hint, write answer.

2. Read `context/operations-context.md`. Missing or empty → stop, tell me run `set-up-my-ops-info` first  -  never invent priorities, VIPs, hard nos.

3. Branch on `mode`:

   **If `mode = daily`:**
   - Detect brain-dump sub-mode: pasted >100 words task-flavored content → parse dump as primary input; else run default aggregate.
   - Pull last-24h data via Composio: inbox (`composio search inbox` / `gmail`), calendar (`googlecalendar`), team chat (`slack`), drive edits (`googledrive`). Category not connected → skip section, name explicitly.
   - Produce brief: Fires (≤3, verb + object), Today's meetings (1-line prep), What changed overnight, Can wait (default deferral), The one move.
   - Brain-dump sub-mode: bucket into urgent-fires / strategic / operational / future-ideas / personal; calendar reality check; 2-3 strategic picks grounded in active priorities from operating context; delegation candidates.

   **If `mode = meeting-pre`:**
   - Resolve target meeting (by ID, or best-match from calendar if you said "my 2pm").
   - Each external attendee, pull: recent email threads (inbox search), public activity (web search / LinkedIn via Composio), shared history (past meetings + emails).
   - Draft suggested agenda reflecting what they'll likely want based on thread history + my `context/operations-context.md` priorities.
   - Call out ONE thing not to forget.

   **If `mode = meeting-post`:**
   - Pull transcript from connected meeting recorder (Fireflies / Gong). Not connected → accept pasted transcript.
   - Extract decisions made, owners + dates per follow-up, open questions, 2-4 verbatim quotes worth keeping.
   - Flag anything deserving `log-a-decision` run (don't run inline  -  surface candidate).

4. Write atomically (`.tmp` then rename). Brief already exists today → append `-v2`, `-v3` (re-briefs happen).

5. Append to `outputs.json` with `{id, type, title, summary, path, status, createdAt, updatedAt, domain: "planning" or "people"}`. Type `"brief"` for `daily`, `"meeting-prep"` for `meeting-pre`, `"meeting-notes"` for `meeting-post`.

6. Summarize to you in chat: "one move" line (daily), or top-3 agenda items + thing not to forget (meeting-pre), or decisions + outstanding owners (meeting-post).

## Outputs

- `briefs/{YYYY-MM-DD}.md` (or `briefs/{YYYY-MM-DD}-dump.md` for brain-dump sub-mode).
- `meetings/{YYYY-MM-DD}-{slug}-pre.md` or `meetings/{YYYY-MM-DD}-{slug}-post.md`.
- Appends to `outputs.json`.

## What I never do

- Send outbound message during brief  -  flags reply-needed thread → drafting is `draft-a-message type=reply`.
- Invent attendee's role, history, preference  -  thin research → mark TBD.
- Touch inbox state (no archive, no label, no mark-as-read)  -  read-only.