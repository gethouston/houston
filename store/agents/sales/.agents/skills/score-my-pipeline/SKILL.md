---
name: score-my-pipeline
description: "Score what you need scored. Pick the subject: every un-scored lead against your ideal customer profile, a single lead's fit and angle, every open deal on health drivers, or every customer's color. I name the top two drivers per row so nothing is a black-box number."
version: 1
category: Sales
featured: no
image: handshake
integrations: [hubspot, salesforce, attio, stripe]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Score My Pipeline

One skill, four scoring surfaces. `subject` param picks rubric. "Transparent drivers, no magic numbers" discipline shared.

## Parameter: `subject`

- `lead`  -  bulk-score every un-scored lead in `leads.json` (plus any new-leads view in connected CRM). System-wide pass, not single-lead. Returns ranked table.
- `lead-fit`  -  single named lead: fit score + angle to pitch. Fast, one-row.
- `deal-health`  -  every open deal in `deals.json` (or connected CRM open-deal view). Drivers: time-in-stage, qualification completeness, touch recency. Returns per-deal GREEN / YELLOW / RED.
- `customer-health`  -  every current customer in `customers.json`. Drivers: product usage trend, satisfaction score if captured, support ticket volume, billing signal (downgrade proximity). GREEN / YELLOW / RED, top 2 drivers named per row.

User ask names subject plain English ("score leads", "fit check", "pipeline health", "who's red") → infer. Else ask ONE question naming 4 options.

## When to use

- Explicit triggers in description.
- Implicit: inside `manage-my-crm action=route` (route needs score); inside `write-my-outreach stage=churn-save` (red customer-health row triggers save); inside `check-my-sales subject=pipeline` (health roll-up uses per-deal scores).

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **CRM**  -  pull leads, open deals, customer records. Required for `lead`, `deal-health`, `customer-health`.
- **Billing**  -  pull downgrade or cancel signal. Required for `customer-health`.
- **Scrape / Search**  -  enrich a single lead for `lead-fit`. Optional.

If your CRM isn't connected I stop and ask you to link HubSpot, Salesforce, Attio, Pipedrive, or Close first.

## Information I need

I read your sales context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your sales playbook**  -  Required. Why I need it: Your ideal customer profile and disqualifiers drive lead and fit scoring; qualification framework and stage exit-criteria drive deal-health. If missing I ask: "I don't have your playbook yet  -  want me to draft it now?"
- **Connected CRM**  -  Required for `lead`, `deal-health`, `customer-health`. Why I need it: I score real rows, not invented ones. If missing I ask: "Connect your CRM (HubSpot, Salesforce, Attio, Pipedrive, or Close) so I can pull leads, deals, and customers."
- **Health thresholds**  -  Optional, for `customer-health`. Why I need it: turns drivers into GREEN/YELLOW/RED. If you don't have your own I keep going with sensible defaults (GREEN = weekly-active + no downgrade signal; YELLOW = one concern; RED = two or more) and confirm before locking them in.
- **Product usage source**  -  Optional, helpful for `customer-health`. Why I need it: usage trend is the strongest health driver. If you don't have it I keep going with TBD on that driver.

## Steps
<!-- houston-workflow:v1 -->

1. **Read ledger + playbook.** Gather missing required fields (ONE question each, best-modality first). Write atomically.

2. **Pull population.**
   - `lead`: read `leads.json` + `composio <crm> get-new-leads` (or equivalent for connected CRM).
   - `lead-fit`: named lead row (or pasted data).
   - `deal-health`: `deals.json` + `composio <crm> get-open-deals`.
   - `customer-health`: `customers.json` + `composio <crm> get-customers`; pull billing signal via Stripe; pull usage signal via PostHog / Mixpanel / Amplitude if connected.

3. **Score, per rubric.**
   - `lead` / `lead-fit`: per row, compare against playbook ideal customer profile + disqualifiers. Score each dimension 0-3. Drop hard disqualifiers to RED. Sum → GREEN (≥ 80%) / YELLOW (50-79%) / RED (< 50% or any disqualifier). Produce **angle** (single pain from playbook) for each GREEN.
   - `deal-health`: three drivers per deal  -  **time in stage** vs playbook baseline (RED if >2x baseline), **qualification** (% of framework pillars covered  -  RED if <50%), **touch recency** (days since last meaningful touch  -  RED if >14 in active stages). Overall = worst driver.
   - `customer-health`: per-customer drivers  -  **usage trend** (% of prior-4-week baseline), **satisfaction score** if captured, **support tickets** (count × severity, if accessible), **billing signal** (downgrade or cancel in flight). Overall = worst driver. Name top 2 drivers per row.

4. **Write scored batch** atomically to `scores/{subject}-{YYYY-MM-DD}.md`  -  ranked table + drivers per row + suggested next moves. For `lead-fit` single-row, same shape but one row.

5. **Update relevant entity file.**
   - `lead` + `lead-fit`: update `leads.json` row with `fitScore` + `scoredAt`.
   - `deal-health`: update `deals.json` row with `healthScore` + `healthDrivers` + `scoredAt`.
   - `customer-health`: update `customers.json` row with `healthColor` + `healthDrivers` + `scoredAt`.

6. **Append to `outputs.json`**  -  read-merge-write atomically: `{ id (uuid v4), type: "score", title: "{Subject} score  -  {YYYY-MM-DD}", summary: "<N rows. {R} red, {Y} yellow, {G} green.>", path, status: "ready", createdAt, updatedAt, domain: "<outbound (lead/lead-fit) | crm (deal-health) | retention (customer-health)>" }`.

7. **Summarize to user.** Counts + top row to act on. Suggest next skill ("Route the GREENs with `manage-my-crm action=route`?" / "Draft saves for the REDs with `write-my-outreach stage=churn-save`?").

## What I never do

- Invent number or signal. Every driver cites concrete data point (row, event count, days).
- Push scores into CRM without approval. Updates to `leads.json` / `deals.json` / `customers.json` local indexes; anything mutating external systems goes through `manage-my-crm action=queue-followup`.
- Black-box result  -  always name drivers.

## Outputs

- `scores/{subject}-{YYYY-MM-DD}.md`
- Updates `leads.json` / `deals.json` / `customers.json` rows.
- Appends to `outputs.json` with `type: "score"`.