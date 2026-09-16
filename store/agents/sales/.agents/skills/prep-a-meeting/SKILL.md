---
name: prep-a-meeting
description: "Prep me for a meeting in the shape that fits: a one-page call prep with the right questions for the deal's weakest qualification pillar, or an account review pack with shipped outcomes, usage trend, risks, and renewal runway. Both pull from your playbook and the deal or customer history - no generic templates."
version: 1
category: Sales
featured: yes
image: handshake
integrations: [googlecalendar, hubspot, salesforce, attio, gong, fireflies, stripe, linkedin]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Prep A Meeting

One skill, two meeting-prep shapes. `type` param pick structure. Playbook-grounding + "no generic templates" shared.

## Parameter: `type`

- `call`  -  pre-call one-pager (discovery / demo / followup / late-stage). Goal · attendees · questions · objections · exit criteria.
- `account-review`  -  quarterly account review pack for existing customer. Outcomes · usage trend · open asks · risks · next-quarter goal.

User ask names type plain English ("call prep", "account review") → infer. Else ask ONE question naming 2 options.

## When to use

- Explicit triggers in description.
- Implicit: `brief-me-for-today` detect imminent meeting no prep, chain here for `type=call`; customer-retention routine chain here for `type=account-review` before renewal window.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Calendar**  -  pull meeting time and attendees. Required.
- **CRM**  -  read the deal or customer record (stage, owner, contacts). Required.
- **Meetings**  -  pull prior call transcripts for `type=call`. Optional.
- **Social**  -  enrich attendee profiles via LinkedIn. Optional.
- **Billing**  -  pull billing state for `type=account-review`. Optional.

If calendar or CRM aren't connected I stop and ask you to connect them first  -  prep is grounded in the meeting and the deal.

## Information I need

I read your sales context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your sales playbook**  -  Required. Why I need it: I prioritize questions against your qualification framework and pull your primary first-call goal. If missing I ask: "I don't have your playbook yet  -  want me to draft it now?"
- **Which meeting this is for**  -  Required. Why I need it: I pull the calendar event, attendees, and the deal it ties to. If missing I ask: "Which meeting do you want me to prep  -  who's it with and roughly when?"
- **Connected CRM**  -  Required. Why I need it: I read deal stage and prior touches to focus the question bank. If missing I ask: "Connect your CRM (HubSpot, Salesforce, Attio, Pipedrive, or Close), or paste the deal context."
- **Product usage source**  -  Optional, helpful for `type=account-review`. Why I need it: I cite real usage trends. If you don't have it I keep going with TBD on the usage section.

## Steps
<!-- houston-workflow:v1 -->

1. **Read ledger + playbook.** Gather missing required fields (ONE question each, best-modality first). Write atomically.

2. **Branch on type.**
   - `call`:
     1. Read deal row `deals.json` + prior call notes `calls/{slug}/`. Read account brief `accounts/{slug}/brief-*.md` (chain `research-an-account depth=full-brief` if missing + user approves).
     2. Pull meeting details Google Calendar (via Composio) if meeting time specified. Capture attendees (title + role, enrich via LinkedIn if thin).
     3. Compile one-pager:
        - **Meeting goal**  -  from playbook primary first-call goal, adjust for stage (discovery / demo / late-stage).
        - **Attendees**  -  name, title, 1-line profile + likely motivation this meeting.
        - **Context recap**  -  2-3 bullets from account brief + prior call analysis.
        - **Question bank**  -  5-8 questions from playbook qualification framework. Prioritize weakest pillar on current deal state (reference prior call analyses if exist).
        - **Likely objections**  -  top 2 from playbook objection handbook + current best reframe per.
        - **Exit criteria**  -  what must be true at call-end for deal advance stage (from playbook deal-stages + exit-criteria section).
        - **Landmines to avoid**  -  anything from `call-insights/*.md` flagged loss pattern for segment.
     4. Save `deals/{slug}/call-prep-{YYYY-MM-DD}.md` (atomic `*.tmp` → rename). Create `deals/{slug}/` if missing.
     5. Update `deals.json` row  -  set `lastCallPrepAt`.
   - `account-review`:
     1. Read customer row `customers.json` + prior account review (`customers/{slug}/account-review-*.md`) to make this update, not rewrite.
     2. Pull usage trend via PostHog / Mixpanel / Amplitude (if connected). Pull billing state via Stripe. Pull open support tickets if ticket tool connected.
     3. Compile account review pack:
        - **Outcomes shipped**  -  against success metric locked at kickoff (from `customers/{slug}/onboarding-plan.md` if exists). Show numbers.
        - **Usage trend**  -  quarter-over-quarter. Cite metric source.
        - **Open asks**  -  open feature requests + support escalations.
        - **Risks**  -  yellow/red drivers from latest `score-my-pipeline subject=customer-health` run.
        - **Next-quarter goal**  -  one concrete outcome, tied to product roadmap if visible.
        - **Renewal runway**  -  days to renewal + pricing stance reminder (from playbook).
     4. Save `customers/{slug}/account-review-{YYYY-QN}.md`.
     5. Update `customers.json` row  -  set `lastAccountReviewAt`.

3. **Append to `outputs.json`**  -  read-merge-write atomically: `{ id (uuid v4), type: "call-prep" (for call) | "account-review-prep" (for account-review), title, summary: "<meeting goal | top risk + top outcome>", path, status: "ready", createdAt, updatedAt, domain: "<meetings | retention>" }`.

4. **Summarize to user.** Meeting goal (or top outcome for account review) + top 3 questions (or top risk for account review) inline. Path to full prep.

## What I never do

- Invent attendees, usage numbers, prior-call facts. Every row cite source.
- Ship generic discovery-call template  -  every question bank prioritized against deal current qualification state.
- Write account review as dashboard  -  narrative with 3 risks + 3 wins, not graph.

## Outputs

- `call` → `deals/{slug}/call-prep-{YYYY-MM-DD}.md`; updates `deals.json`.
- `account-review` → `customers/{slug}/account-review-{YYYY-QN}.md`; updates `customers.json`.
- Append `outputs.json`.