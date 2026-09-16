---
name: track-my-promises
description: "Every time you tell a customer you'll do something by a certain date, I write it down with a deadline so it doesn't slip. I pull the promise straight from your reply, parse the due date, and link it to the thread. These show up in your morning brief automatically, so nothing falls through the cracks."
version: 1
category: Support
featured: no
image: headphone
x_houston:
  created_by: houston
  skill_schema: 1
---


# Track My Promises

## When to use
- Say "send it" / "approved" on `draft.md` with time-bound language.
- Write own reply in chat with date, day, or timeframe.
- Review existing thread, mention "oh right, I told them I'd…".

Any phrase like: "I'll X by Y", "next week", "tomorrow", "by Friday", "end of day", "within the hour" triggers this.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Inbox** (Gmail / Outlook)  -  optional, only used to pull the source thread when the promise lives in an email I haven't ingested yet.

This skill mostly works against your local conversation index, so no connection is strictly required.

## Information I need

I read your support context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **The promise text**  -  Required. Why I need it: I track what was actually said, not what I thought I heard. If missing I ask: "What did you commit to, and to which customer or thread?"
- **The due date or timeframe**  -  Required. Why I need it: vague deadlines slip silently. If missing I ask: "When did you tell them you'd get back  -  a specific day, end of week, or did you leave it open?"
- **Conversation or customer link**  -  Optional. Why I need it: lets me file the followup against the right thread. If you don't have it I keep going with TBD and ask you to point me at the thread later.

## Steps
<!-- houston-workflow:v1 -->
1. **Extract promise text** verbatim from message or draft (keep original phrasing  -  may want see what they said).
2. **Parse due date.**
   - Explicit date ("Friday", "March 3") → next occurrence in local timezone → ISO-8601 UTC.
   - Relative ("tomorrow", "next week") → apply relative to now.
   - Vague ("soon", "asap", no date) → default `now + 48h`, note ambiguity in promise text.
3. **Link to conversation.** Pull `conversationId` and `customerSlug` from thread.
4. **Append atomically** to `followups.json`:
   ```json
   { "id": "<uuid>", "conversationId": "...", "customerSlug": "...", "promise": "...", "dueAt": "...", "status": "open", "createdAt": "...", "updatedAt": "..." }
   ```
5. **Mirror promise** as dated line in `conversations/{id}/notes.md`.
6. If existing open followup on same conversation contradicted by new promise (e.g. date pushed), mark old one `status: "cancelled"`, reference new id.

## Outputs
- Appends to `followups.json`
- Appends dated line to `conversations/{id}/notes.md`
- Optionally cancels superseded followup
