---
name: catch-me-up-on-a-thread
description: "Point me at a customer conversation and I give you the short version: where things stand, what you promised, and what the customer is waiting for. Three bullets instead of re-reading a 20-message thread. Especially useful before you draft a reply on something that's been sitting."
version: 1
category: Support
featured: no
image: headphone
integrations: [gmail, outlook]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Catch Me Up on a Thread

## When to use
`conversations/{id}/thread.json` has >handful of messages, need context fast. Typical triggers:
- You: "what's the story with the Acme thread?"
- Reopen conversation dormant >3 days.
- Before `draft-a-reply` on thread with 5+ messages  -  run first, draft better.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Inbox** (Gmail / Outlook)  -  pull the live thread if it's not already in `conversations.json`. Optional.
- **Support helpdesk** (Intercom / Zendesk / Help Scout)  -  alternate thread source. Optional.

I keep going against the local thread index if neither is connected, but I'll tell you the summary may be missing the latest reply.

## Information I need

I read your support context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Which thread**  -  Required. Why I need it: I summarize one specific conversation, not "support in general." If missing I ask: "Which conversation should I summarize  -  share the customer's name or the latest subject line?"
- **Audience for the summary**  -  Optional. Why I need it: a 3-bullet for you reads differently than a handoff for a teammate. If you don't have it I keep going with TBD and write it for your eyes.

## Steps
<!-- houston-workflow:v1 -->
1. **Load** `conversations/{id}/thread.json` and index row from `conversations.json`.
2. **Walk thread chronologically.** Note: customer's original ask, scope changes, every promise made, every answer given.
3. **Produce exactly three bullets:**
   - **Where we are**  -  last message, sender, current state (waiting on customer / waiting on us / drafting).
   - **What we promised**  -  outstanding commitments. Pull from `followups.json` filtered by conversation, plus uncaptured promises in thread (recommend `track-my-promises` if found).
   - **What customer expects next**  -  most recent explicit or implied ask.
4. **Append summary** as dated block in `conversations/{id}/notes.md`  -  persisted for next time.

## Outputs
- Returns 3-bullet summary to chat
- Appends dated summary block to `conversations/{id}/notes.md`
