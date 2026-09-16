---
name: manage-my-crm
description: "Run the CRM action you need: a hygiene sweep that diffs dupes and stage mismatches without mutating, a natural-language read-only query, a routing pass that assigns GREEN, nurtures YELLOW, and drops RED, or a follow-up task pushed to your task tool. I never mutate without your per-row approval."
version: 1
category: Sales
featured: no
image: handshake
integrations: [hubspot, salesforce, attio, pipedrive, notion, linear]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Manage My CRM

One skill, four CRM actions. `action` param pick op. "Read-first, mutate-only-with-approval" shared.

## Parameter: `action`

- `clean`  -  hygiene sweep: dupes, missing required fields, stage mismatches (e.g. deal Stage 3, no champion captured). Write diff list. Mutate only on explicit per-row approval.
- `query`  -  natural-language question → read-only CRM query → answer + query ran. "How many deals in Stage 2?" / "Show deals closing this month." / "Who owns Acme?"
- `route`  -  read latest lead scores, apply playbook routing policy (default: GREEN → assign owner, YELLOW → nurture queue, RED → drop). Write decisions; mutate CRM owner fields only on approval.
- `queue-followup`  -  push task to connected task tool (Linear / Notion / Asana-style). Task content: who, what, when, linked deal / lead.

User ask imply action ("clean up CRM", "what's my pipeline", "route leads", "queue followup") → infer. Else ask ONE question naming 4 options.

## When to use

- Explicit triggers in description.
- Implicit: after `score-my-pipeline subject=lead` done, chain `action=route`. After `check-my-sales subject=discovery-call` or `write-my-outreach stage=followup`, chain `action=queue-followup` for next step.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **CRM**  -  read contacts, deals, and stages; mutate only on per-row approval. Required for every action.
- **Task tools**  -  push a task into Linear, Notion, Asana-style queues. Required for `queue-followup`.

If your CRM isn't connected I stop and ask you to link HubSpot, Salesforce, Attio, Pipedrive, or Close from the Integrations tab.

## Information I need

I read your sales context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Connected CRM**  -  Required for every action. Why I need it: every row must cite a real record. If missing I ask: "Which CRM should I work with  -  HubSpot, Salesforce, Attio, Pipedrive, or Close? Connect it from the Integrations tab."
- **Your deal stages and owner map**  -  Required for `clean` and `route`. Why I need it: I detect stage mismatches and assign GREEN leads to the right owner. If missing I ask: "Walk me through your deal stages and who owns which segment."
- **Your sales playbook**  -  Required for `clean` and `route`. Why I need it: stage exit-criteria drive mismatch detection and your ideal customer profile grounds the RED drop. If missing I ask: "I don't have your playbook yet  -  want me to draft it now?"
- **Routing policy**  -  Optional. Why I need it: I default to "GREEN to owner, YELLOW to nurture, RED dropped." If you don't have a different rule I keep going with that default.
- **Connected task tool**  -  Required for `queue-followup`. Why I need it: I push tasks somewhere you'll actually see them. If missing I ask: "Where should follow-ups land  -  Linear, Notion, Asana?"

## Steps
<!-- houston-workflow:v1 -->

1. **Read ledger + playbook.** Gather missing required fields (ONE question each, best-modality first). Write atomic.

2. **Discover CRM slug via Composio.** `composio search crm` → pick connected. None → name category to link and stop.

3. **Branch on action.**
   - `clean`:
     1. Pull full contact + deal list via CRM read tools.
     2. Detect issues:
        - **Dupes**  -  contacts matching email domain + last name + first-name fuzzy; deals same account + overlapping amount.
        - **Missing required fields**  -  per playbook qualification framework (e.g. Stage-3 deal, no champion captured).
        - **Stage mismatches**  -  deal Stage N but Stage N-1 exit criteria not met; stale deals (no activity >30 days, active stages).
     3. Write diff list to `crm-reports/clean-{YYYY-MM-DD}.md`  -  one section per issue type, each row with **recommended mutation** + approve command (per row, not blanket). Nothing mutated yet.
     4. Show top 10 issues inline + path. Wait explicit per-row approval before execute mutations via `composio <crm> <action>`.
   - `query`:
     1. Parse question into structured query (entity + filters + grouping).
     2. Run query read-only via connected CRM.
     3. Return answer + query ran (user adjust). Save to `crm-reports/query-{YYYY-MM-DD}.md` with question, query, answer table. No mutate.
   - `route`:
     1. Read latest `scores/lead-*.md` (or run `score-my-pipeline subject=lead` first if stale) and `leads.json`.
     2. Apply routing policy:
        - **GREEN** → assign default owner from `ownerMap` (ask once if missing).
        - **YELLOW** → nurture queue (surface for `write-my-outreach stage=cold-email` later).
        - **RED** → drop (disqualifier cited).
     3. Write decisions to `crm-reports/route-{YYYY-MM-DD}.md`. Show top 10 inline + counts per bucket. Wait approval before mutate CRM owner fields.
   - `queue-followup`:
     1. Parse ask: who, what, when. Pull deal / lead reference if named.
     2. Discover task tool via `composio search task`. None → ask once which to use.
     3. Push task via tool's create-task slug. Capture task URL.
     4. Log to `tasks/{YYYY-MM-DD}.md` (append  -  running log, not per-task file).

4. **Append to `outputs.json`**  -  read-merge-write atomic: `{ id (uuid v4), type: "crm-sweep" (clean) | "crm-query" (query) | "routing-decision" (route) | "task-queued" (queue-followup), title, summary, path, status: "ready" (or "draft" for clean / route until mutations approved), createdAt, updatedAt, domain: "crm" }`.

5. **Summarize to user.** Top finding + next required approval (clean / route) or confirmation (query / queue-followup). Never mutate without explicit per-row approval.

## What I never do

- Mutate CRM records (stage change, owner reassign, contact delete) without explicit per-row approval.
- Invent CRM field or deal  -  every row cites real record ID from connected CRM.
- Query outside read-only scope user authorized.
- Push task to unconnected tool  -  always discover via Composio.

## Outputs

- `clean` → `crm-reports/clean-{YYYY-MM-DD}.md`
- `query` → `crm-reports/query-{YYYY-MM-DD}.md`
- `route` → `crm-reports/route-{YYYY-MM-DD}.md`
- `queue-followup` → append to `tasks/{YYYY-MM-DD}.md`
- Append to `outputs.json`.