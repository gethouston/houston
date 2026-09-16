---
name: set-up-my-support-info
description: "Tell me the basics about your product, your customers, and how you handle support so I can give you better help. I ask a few quick questions about your product, response-time targets, VIP list, routing rules, and known gotchas. You only need to do this once, and I keep it updated as things change."
version: 1
category: Support
featured: yes
image: headphone
integrations: [googledocs, stripe, notion, github, linear]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Set Up My Support Info

Own `context/support-context.md`. Only skill that creates or updates full doc (routing section also editable by `tune-my-routing`). Every other skill read it before work  -  until exists, stop and ask you run me first.

## When to use

- "set up our support context" / "define our support context" / "let's do the context doc".
- "update the context doc" / "a new tier / VIP / gotcha  -  fix the context".
- Called implicitly by any other skill needing context and finds doc missing  -  but only after confirming with you.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Docs / notes** (Google Docs / Notion)  -  pull existing positioning or product docs to seed the draft. Optional.
- **Billing** (Stripe)  -  read live plan tiers if you'd rather I infer them than ask. Optional.
- **Dev tracker** (GitHub / Linear)  -  named target for the bug routing rule. Optional.

If none of these are connected I keep going  -  this skill is mostly an interview, connections only speed it up.

## Information I need

I read your support context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Company basics**  -  Required. Why I need it: anchors the product overview at the top of the doc. If missing I ask: "What does the product do in one sentence, and who buys it?"
- **Customer segments + VIP list**  -  Required. Why I need it: VIPs get P1 priority regardless of content; segments shape every reply. If missing I ask: "Who are your top 5 customers right now, and are there segments (SMB / mid-market / enterprise) I should treat differently?"
- **Response-time targets**  -  Required. Why I need it: response-time expectations per tier. If missing I ask: "What response time do you want to hit for your most urgent tickets, and what's acceptable for the rest?"
- **Routing categories**  -  Required. Why I need it: triage and signal detection map every inbound message to one. If missing I ask: "When a ticket comes in, what buckets do you sort it into  -  bug, how-to, billing, anything else?"
- **Escalation tiers**  -  Required. Why I need it: P1 / P2 / P3 / P4 definitions for triage. If missing I ask: "What makes something a fire-drill versus a same-day versus a this-week thing?"
- **Verbatim voice samples**  -  Optional. Why I need it: tone section reads truer with real phrases. If you don't have it I keep going with TBD and recommend running voice calibration.

## Workflow
<!-- houston-workflow:v1 -->

1. **Read `config/context-ledger.json`.** Need `universal.company`, `universal.idealCustomer`, `domains.inbox.responseTimeTargets`, `domains.inbox.routingCategories`, `domains.quality.escalationTiers`. Any missing field, ask ONE targeted question with modality hint (connected app > file > URL > paste), write atomic, continue.

2. **Read existing doc if present.** If `context/support-context.md` exists, read so run is update not rewrite. Preserve anything sharpened; change only stale or new.

3. **Push for verbatim language.** Before drafting, ask you for 2–3 verbatim customer phrases or example tickets  -  friction words, repeat gotchas. If `voice-samples/` has entries, mine first.

4. **Draft doc (~400–700 words, opinionated, direct).** Structure, this order:

   1. **Product overview**  -  one paragraph: what product is, who for, key surface areas (features/flows), pricing model, self-serve vs gated.
   2. **Customer segments + VIP list**  -  named segments + VIP accounts. VIPs get P1 regardless of content.
   3. **Tone + voice**  -  default tone (direct / warm / human), 3–5 verbatim samples from `voice-samples/` if present (else `TBD  -  run calibrate-my-voice`), forbidden phrases.
   4. **Response-time tiers**  -  P1 / P2 / P3 / P4 definitions + response-time expectations per tier. Name what qualifies as each tier.
   5. **Routing rules**  -  decision tree:
      - Bug → tracker target (Linear / GitHub  -  from config or ask); capture info (repro, version, customer).
      - Feature request → `requests.json`, with customer attribution.
      - Outage → playbook reference (`playbooks/p1-outage.md` once drafted).
      - Billing → Stripe dossier + refund approver (founder by default).
   6. **Known gotchas**  -  short whisper-list of product quirks answered 10+ times. 3–10 bullets.

5. **Mark gaps honestly.** If section thin, write `TBD  -  {what you should bring next}`. Never invent.

6. **Write atomically.** Write to `context/support-context.md.tmp`, rename to `context/support-context.md`. Single file under `context/`  -  NOT under `.agents/` or `.houston/` (watcher skips).

7. **Append to `outputs.json`.** Read existing array, append new entry (`type: "support-context"`, `domain: "quality"`, title summarizing change), write atomic.

8. **Summarize to me.** One paragraph: what wrote, what still `TBD`, next move ("next: run `calibrate-my-voice`" / "next: tell me which tracker you use for bugs"). Remind me every other skill now operate against doc.

## Outputs

- `context/support-context.md` (at agent root  -  live document)
- Appends to `outputs.json` with `type: "context-edit"`.
