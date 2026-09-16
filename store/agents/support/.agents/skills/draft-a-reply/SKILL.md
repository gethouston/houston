---
name: draft-a-reply
description: "Tell me which conversation and I write your reply. I pull up the customer's history, read your past messages to match your voice, and draft something that actually addresses what they asked, whether it's a bug, a how-to, or a billing question. I never send it and I never promise a date you haven't approved."
version: 1
category: Support
featured: yes
image: headphone
integrations: [gmail, outlook]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Draft a Reply

## When to use

- You say "draft a reply for {conversation id}" or "draft my response."
- `check-my-inbox` surfaced thread in morning brief, you clicked in.
- Triaged conversation has status `open` / `waiting_founder`, no `draft.md` yet.
- **Never** called to send  -  this skill drafts only.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Inbox** (Gmail / Outlook)  -  pull the live thread and sample your sent replies for tone. Required.
- **CRM** (HubSpot / Attio / Salesforce)  -  pull plan, owner, account record for the dossier I read before drafting. Optional if `customers.json` is already populated.
- **Billing** (Stripe)  -  pull monthly revenue for billing-flavored replies. Optional.

If your inbox isn't connected I stop and ask you to connect Gmail or Outlook first.

## Information I need

I read your support context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Support context doc**  -  Required. Why I need it: product surface, routing rules, response-time tiers, forbidden phrases all live there. If missing I ask: "Want me to walk you through setting up your support context first? It's a quick interview."
- **Voice samples**  -  Required. Why I need it: drafts in the wrong voice get rewritten anyway. If missing I ask: "Want me to pull 10 to 20 of your recent replies to learn your tone, or can you paste 3 to 5 examples?"
- **The thread itself**  -  Required. Why I need it: I draft against the actual customer message, not a paraphrase. If missing I ask: "Which conversation should I draft for  -  share the customer's name or the latest email?"

## Steps
<!-- houston-workflow:v1 -->

1. **Read `context/support-context.md`.** If missing/empty, stop and tell me run `set-up-my-support-info` first.
2. **Load thread** from `conversations/{id}/thread.json`. Identify latest customer message  -  draft respond to that.
3. **Chain `look-up-a-customer view=dossier`** for customer on thread. Pull: plan, monthly revenue, open bug-candidates, open followups (from `followups.json`), any `churn-flags.json` entry, last 3 conversations from history.
4. **Sample voice.** Read `config/voice.md`. If missing or sampleCount < 5, run `calibrate-my-voice` first. Mirror tone cues: greeting, sign-off, sentence length, whether I use customer's first name. No "I apologize for the inconvenience." No corporate hedging.
5. **Draft reply.** Match ask:
   - **Bug**  -  acknowledge, confirm repro if possible, state next step. Never promise fix date I haven't approved  -  say "I'll get back to you with a timeline."
   - **How-to**  -  answer crisp, link KB article if one exists at `articles/{slug}.md` (check before linking).
   - **Billing**  -  state facts, propose action (refund / credit / plan change). Escalate to me before committing.
   - **Churn language**  -  tight, honest, no guilt. Offer genuine option; never promise what not policy in `context/support-context.md`.
6. **Append dossier snippet** to `conversations/{id}/notes.md` (plan, monthly revenue, open bugs, churn status) so I have context when approving.
7. **Write `conversations/{id}/draft.md`** atomically. Update `conversations.json` entry: status = `waiting_founder`, refresh `updatedAt`.
8. **Append to `outputs.json`** with `type: "reply-draft"`, `domain: "inbox"`, title = "Reply to {customer} re {subject}", summary = opening line, path.
9. **Chain `track-my-promises`.** If draft contains commitment ("I'll check with engineering by Friday", "I'll ship next week"), run `track-my-promises` so due date lands in `followups.json`.

## Outputs

- `conversations/{id}/draft.md`
- `conversations/{id}/notes.md` (append dossier snippet)
- `conversations.json` entry update
- Appends to `outputs.json` with `type: "reply-draft"`, `domain: "inbox"`.

## What I never do

- Send reply. You ship every outbound.
- Promise date / refund / exception not in `context/support-context.md`.
- Invent customer history if dossier thin  -  mark UNKNOWN and ask.
