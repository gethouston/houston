---
name: check-my-inbox
description: "Get a quick read on your support inbox. Pick what you need: a morning brief that ranks the 5-10 tickets that actually need you today, an overdue check that flags anything about to miss response-time targets or already past due, or a stale-threads sweep that catches conversations you dropped. I scan, rank, and tell you where to start."
version: 1
category: Support
featured: no
image: headphone
integrations: [gmail, outlook]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Check My Inbox

One skill for every "what do I need to look at right now?" ask. Branches on `scope`.

## When to use

- **morning-brief**  -  "morning brief" / "what's on my plate?" / "where do I start?"
- **overdue**  -  "what's overdue?" / "what's about to miss response-time targets?" / called automatically inside `morning-brief`.
- **stale-threads**  -  "what's waiting on me?" / "anything stale?"  -  threads > 48h mid-resolution, ball in your court.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Inbox** (Gmail / Outlook)  -  scan the live inbox for fresh items, not just `conversations.json`. Required.
- **Support helpdesk** (Intercom / Zendesk / Help Scout)  -  alternate to Inbox if customer messages land there instead. Required if you don't use Gmail / Outlook for support.

If neither inbox nor helpdesk is connected I stop and ask you to link the one you actually use.

## Information I need

I read your support context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Response-time targets**  -  Required. Why I need it: thresholds for "overdue" come from your numbers, not mine. If missing I ask: "What response time do you want to hit for urgent tickets, and what's acceptable for the rest?"
- **VIP list**  -  Required. Why I need it: VIPs always rank above non-VIPs in the morning brief. If missing I ask: "Which 3 to 5 customers should always rise to the top of the queue?"
- **Connected channels**  -  Required. Why I need it: I need to know which inboxes count as "support" so I'm not scanning your personal mail. If missing I ask: "Which inbox or help-desk holds your customer threads?"

## Parameter: `scope`

- `morning-brief`  -  top 5–10 items ranked by (VIP × response-time-at-risk × unblocking-engineering). Each item: 1-line headline + next action. Writes to `briefings/{YYYY-MM-DD}.md`.
- `overdue`  -  open conversations within 2h of missing response-time targets OR already overdue, with customer tier, time remaining, exact next action. Writes to `overdue-reports/{YYYY-MM-DD}.md`.
- `stale-threads`  -  conversations quiet > 48h with me as last responder, grouped by "customer replied and I missed it" vs "I owe them something." Writes to `stale-rescues/{YYYY-MM-DD}.md`.

## Steps
<!-- houston-workflow:v1 -->

1. **Read `context/support-context.md`.** If missing, stop. Tell me to run `set-up-my-support-info` first.
2. **Read ledger.** Fill gaps.
3. **Read `conversations.json`** for all open / waiting items.
4. **Branch on `scope`:**
   - `morning-brief`: compute rank per thread = tier_weight × response_time_risk × content_urgency. Cap 10 items. For each, add one-line next action ("draft the reply," "escalate to engineering," "close  -  nothing to do"). Include one-line summary of `followups.json` due today.
   - `overdue`: filter `conversations.json` to open items where `firstResponseAt` or `lastActivityAt` plus response-time window < 2h from now. For each, list: customer, tier, time left, next action.
   - `stale-threads`: filter to conversations quiet > 48h. Group by "their turn" vs "my turn"  -  only "my turn" actionable. For each, suggest: nudge draft (chain `draft-a-reply`) or close with one-line explanation.
5. **Write artifact** atomically. Append to `outputs.json` with `type` = `morning-brief` | `overdue-report` | `stale-rescue`, `domain: "inbox"`.
6. **Summarize to me**: 2–3 things that actually need me today.

## Outputs

- `briefings/{YYYY-MM-DD}.md` (for `scope = morning-brief`)
- `overdue-reports/{YYYY-MM-DD}.md` (for `scope = overdue`)
- `stale-rescues/{YYYY-MM-DD}.md` (for `scope = stale-threads`)
- Appends to `outputs.json` with `domain: "inbox"`.

## What I never do

- Overrank items to inflate brief  -  quiet day, say so in one line.
- Use hardcoded response-time thresholds  -  always read from `context/support-context.md#response-times` or ledger.
