---
name: capture-my-call-notes
description: "Turn a transcript or recording into structured notes: agenda actual versus intended, attendees, pains in their words, decisions, action items split internal versus external, and the next step. I match the call to the right lead, update their dossier, and only sync to your CRM with your nod."
version: 1
category: Sales
featured: no
image: handshake
integrations: [gong, fireflies]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Capture My Call Notes

Turn raw transcript into structured, queryable, CRM-ready notes.

## When to use

- User: "process my call with Acme" / pastes transcript / drops
  `.txt` or `.vtt` file / "capture notes from yesterday's meeting".
- Called by routine pulling from connected meeting-notes app
  (Fathom, Fireflies, Grain, Circleback, etc.  -  discovered via
  `composio search meeting-notes`).

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Meetings**  -  pull the transcript when you point me at a meeting. Required unless you paste or drop the file.
- **CRM**  -  upsert a meeting/activity record on the lead's contact. Optional.
- **Task tools**  -  log a notes entry in your docs/notes app. Optional.

If none of the required categories are connected and you haven't pasted or dropped a file, I stop and ask you to connect Gong or Fireflies, or share the transcript directly.

## Information I need

I read your sales context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **The transcript or recording**  -  Required. Why I need it: I extract pains, decisions, and action items from what was actually said. If missing I ask: "Drop the recording, paste the transcript, or tell me which Gong/Fireflies meeting to grab."
- **Which lead or deal this call belongs to**  -  Required. Why I need it: I link notes to the right lead and update their dossier. If missing I ask: "Which prospect or customer was this call with?"
- **Whether to push notes to your CRM**  -  Optional. Why I need it: I sync only with your nod. If you don't have a preference I keep going with TBD and ask before any external sync.

## Workflow
<!-- houston-workflow:v1 -->

1. **Source transcript.** If pasted, use it. If file, read it. If
   user points to connected provider, run `composio search` for
   list/search tool, find most recent meeting matching user's
   description, pull transcript.
2. **Identify meeting.** Extract date/time, attendees (separate
   internal vs external), duration, meeting title if available.
3. **Match to lead.** Find external attendee(s) in `leads.json`
   by name + company. If not found, create minimal lead row from
   transcript, mark `source: "meeting-first-contact"`.
4. **Assign id.** `call_id = kebab(date-primary-external-name)`.
5. **Extract structured notes:**
   - **Agenda actual**  -  what actually discussed (not what agenda
     said).
   - **Pain points raised**  -  specific phrases in their words, with
     transcript quote.
   - **Objections raised**  -  price, timing, authority, fit  -  quoted.
   - **Decisions**  -  anything agreed during call.
   - **Action items**  -  owner + what + by when. Split internal vs
     external.
   - **Next step**  -  single next scheduled touchpoint (if agreed)
     or "next step TBD."
6. **Write structured:** `calls/{call_id}/notes.json` with full
   schema + `calls/{call_id}/notes.md` as human-readable rollup.
7. **Update lead dossier.** Append to
   `leads/{slug}/lead.json` → `recentCalls: [...]` (id + date +
   one-line summary). Update `lastContactedAt`, `status` (likely
   "meeting-held" or "follow-up-owed").
8. **Add to `calls.json` index** with id, date, lead slug, attendees,
   next-step summary.
9. **CRM sync (if connected).** Run `composio search crm`. If linked,
   upsert meeting/activity record on lead's CRM contact.
   Include attendees + date + action items + next step. Never sync
   verbatim transcript unless user explicitly opts in (usually out
   of scope for CRM notes fields).
10. **Note-app sync (if connected).** If user has connected
    notes/docs app AND `config/notes-sync.json` says push, create
    note there. Otherwise skip silently.
11. **Summarize to user:** "Captured. 3 pain points, 2 action
    items (1 yours: {X}, 1 theirs: {Y}), next step: {Z}. CRM synced."

## Never invent

If field not clearly present in transcript, write "not stated"
 -  never fill plausible-sounding pain points or owners. Downstream
cost of hallucinated call notes high.

## Outputs

- `calls/{call_id}/notes.json` (structured)
- `calls/{call_id}/notes.md` (human-readable)
- Updates `leads/{slug}/lead.json` and `leads.json`
- Updates `calls.json` index
- Optional: CRM activity upsert
- Optional: notes-app entry