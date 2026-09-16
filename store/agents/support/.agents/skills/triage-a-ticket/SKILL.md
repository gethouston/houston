---
name: triage-a-ticket
description: "Hand me a new ticket and I sort it for you. I read the message, figure out what it is (bug, how-to, billing, feature request), check if the customer is a VIP, assign a priority based on your routing rules, and slot it into your queue so you know exactly what needs attention and how fast."
version: 1
category: Support
featured: yes
image: headphone
integrations: [gmail, outlook, slack]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Triage a Ticket

## When to use
New inbound message landed, no `conversations.json` entry for thread yet, OR existing entry need re-triage because content changed (e.g. how-to turned outage report). Solo founder: triage constant  -  every fresh reply need this skill run first.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Inbox** (Gmail / Outlook)  -  fetch the inbound message and full thread. Required.
- **Support helpdesk** (Intercom / Zendesk / Help Scout)  -  alternate source if customer messages land there. Required if you don't use Gmail / Outlook for support.
- **Messaging** (Slack)  -  source of customer DMs you triage as tickets. Optional.

If no inbox or helpdesk is connected I stop and ask you to link the one your customers actually message.

## Information I need

I read your support context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Routing categories**  -  Required. Why I need it: I sort every inbound into one. If missing I ask: "When a ticket comes in, what buckets do you sort it into  -  bug, how-to, billing, anything else?"
- **Response-time tiers**  -  Required. Why I need it: priority assignment depends on tier thresholds. If missing I ask: "What response time do you want to hit for your most urgent tickets, and what's acceptable for the rest?"
- **VIP list**  -  Required. Why I need it: VIPs floor at P1 regardless of content. If missing I ask: "Which 3 to 5 customers should always get top priority?"
- **Monthly revenue / plan tier per customer**  -  Optional. Why I need it: lets me weight priority by paying-customer status. If you don't have it I keep going with TBD and weight by content signals only.

## Steps
<!-- houston-workflow:v1 -->
0. **Read `context/support-context.md`.** If missing, stop. Tell me run `set-up-my-support-info` first. Read routing rules + response-time tiers + VIP list from doc  -  never hardcode.
1. **Identify source**  -  you name channel or message referenced by external id. Use `composio search <channel>` to find correct fetch slug (e.g. Gmail thread fetch, Intercom conversation fetch). Do NOT hardcode tool slugs.
2. **Fetch raw thread** via Composio. Pull subject, all messages, sender email, external message ids.
3. **Resolve customer.** Look up `customers.json` by sender email. If not found, create new index entry (slug = kebab-cased email local-part, deduped if needed).
4. **Categorize** content against routing categories in `context/support-context.md` (typical set: `bug | how-to | feature | billing | account | security | other`). Content signals: error messages + stack traces lean bug; "how do I…" lean how-to; "can you add…" lean feature; keywords "refund", "invoice", "charge" lean billing.
5. **Assign priority (P1–P4)** using tier thresholds from `context/support-context.md`. Typical start rules: monthly revenue >= $500/mo → base P2; VIP tag → P1 floor. Escalate on content: "down", "can't log in", "data loss", "production" → bump one level (max P1). De-escalate on "whenever you get a chance".
6. **Set response-time fields** using `domains.inbox.responseTimeTargets.firstResponseHours` (fallback to tier table in context doc). `breached = false` initially.
7. **Write atomically.** Upsert into `conversations.json`. Write full messages to `conversations/{id}/thread.json`.
8. **Append to `outputs.json`** with `type: "triage"`, `domain: "inbox"`, title = `{customer}  -  {subject}`, summary = category + priority, path.

## Outputs
- Writes to `conversations.json` (index upsert)
- Writes to `conversations/{id}/thread.json` (full thread)
- Writes to `customers.json` (new customer row if needed)
- Appends to `outputs.json` with `type: "triage"`, `domain: "inbox"`.
