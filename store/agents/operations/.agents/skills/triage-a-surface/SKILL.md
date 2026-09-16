---
name: triage-a-surface
description: "Cut through your inbox or calendar so you know what actually needs you today. Pick what you need: an inbox triage that sorts the last 24 hours into needs-me-today, can-wait, and ignore with a specific verb-plus-object action per thread; or a calendar scan that flags overbooks, missing buffers, focus-block clashes, unprotected VIP slots, and meetings without prep across the next 7 days."
version: 1
category: Operations
featured: yes
image: clipboard
integrations: [googlecalendar, gmail, outlook]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Triage A Surface

Classify + rank two surfaces eat week: inbox, calendar. Never draft replies (that `draft-a-message`), never edit events (that `book-a-meeting`).

## When to use

- `surface=inbox`  -  "triage my inbox" / "what's in my email" / "summarize my inbox" / "inbox roundup".
- `surface=calendar`  -  "scan my calendar" / "find conflicts" / "how's my week" / "rebalance my week".

## Connections I need

I run external work through Composio. Before this skill runs I check the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Inbox** (Gmail, Outlook)  -  Required for `surface=inbox`. Pulls last-24h threads so I can classify and rank.
- **Calendar** (Google Calendar, Outlook)  -  Required for `surface=calendar`. Reads the next 7 days for conflicts and unprotected slots.

If you ask for inbox triage and no inbox is connected, I stop and ask you to connect your inbox first. Same for calendar.

## Information I need

I read your operations context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Operating context doc**  -  Required. Why I need it: anchors priorities, key contacts, hard nos so I rank what actually matters. If missing I ask: "Want me to set up your operating context first? Triage gets sharper after."
- **VIPs**  -  Required. Why I need it: VIPs ride to the top of the inbox and trigger unprotected-slot alerts on the calendar. If missing I ask: "Who are the people whose threads always need a same-day reply  -  investors, key customers, anyone else?"
- **Focus blocks**  -  Required for `surface=calendar`. Why I need it: I flag meetings that crash into your deep-work time. If missing I ask: "When are your protected focus blocks  -  specific days, specific hours?"
- **Max meetings per day**  -  Required for `surface=calendar`. Why I need it: drives the overload flag. If missing I ask: "What's a normal-busy versus over-loaded day for you in number of meetings?"
- **Your timezone**  -  Required. Why I need it: reads windows in your time, not UTC. If missing I ask: "What timezone do you work in most of the time?"

## Parameter: `surface`

- `inbox`  -  classify last-24h (or custom window) threads into `needs-me-today` / `can-wait` / `ignore`, rank top bucket by time-sensitivity, state verb+object action per thread. Writes `triage/{YYYY-MM-DD}.md`.
- `calendar`  -  scan next 7 days for overbooks, missing buffers, focus-block clashes, unprotected VIP slots, meetings without prep. Writes `calendar-scans/{YYYY-MM-DD}.md` + upserts `calendar-conflicts.json`.

## Steps
<!-- houston-workflow:v1 -->

1. Read `config/context-ledger.json`. Fill gaps with ONE targeted question.
2. Read `context/operations-context.md`. Missing: stop, ask me run `set-up-my-ops-info` first  -  no invent priorities.
3. Branch on `surface`:

   **If `surface = inbox`:**
   - Pull threads via connected inbox (Gmail / Outlook via Composio). Default window: last 24 hours. Include sender, subject, first 200 chars of latest message, whether reply to something I sent.
   - Classify each thread:
     - `needs-me-today`  -  someone waiting on me, decision due before end of day, or sender in Key Contacts.
     - `can-wait`  -  legit but not urgent. Note default deferral ("wait for their follow-up" / "batch Friday" / "hand to `draft-a-message type=reply`").
     - `ignore`  -  newsletters, cold outreach, receipts, automated notifications.
   - Rank `needs-me-today` bucket: irreversible-if-missed > customer-in-distress > investor-pending > everything else.
   - Per thread, write verb + object action ("reply with pricing page", "forward to Vendor Ops for renewal decision", "decline  -  not our ideal customer", "delegate to {contact}"). Never "review."

   **If `surface = calendar`:**
   - Pull next 7 days via connected calendar (`googlecalendar` / `outlook`). Include attendees, descriptions, durations, start/end in your timezone.
   - Flag each conflict class: overbook (2 events same time), no-buffer (back-to-back with <5 min), focus-block clash (meeting inside declared focus block), unprotected VIP slot (VIP time with no prep event or empty description), unprepped meeting (external attendees + no agenda in description + no prior brief in `meetings/`).
   - Rank by severity (overbook > VIP-unprotected > focus-clash > no-buffer > unprepped).

4. Write atomically (`.tmp` then rename). Second same-day pass becomes `{date}-{HH}.md`.
5. Append to `outputs.json` with `{id, type, title, summary, path, status, createdAt, updatedAt, domain: "people"}`. Type = `"triage"` (inbox) or `"calendar-scan"` (calendar).
6. Summarize to you: bucket counts + top action (inbox), or worst conflict + fix (calendar).

## Outputs

- `triage/{YYYY-MM-DD}.md` (inbox)
- `calendar-scans/{YYYY-MM-DD}.md` + upserts `calendar-conflicts.json` (calendar)
- Appends to `outputs.json`.

## What I never do

- Draft, send, archive, label, star, mark-as-read anything  -  read-only. Draft = `draft-a-message`.
- Create, move, cancel calendar events  -  that `book-a-meeting`.
- Invent urgency  -  thread state unclear: surface in `needs-me-today` with question for you, no fabricate deadline.