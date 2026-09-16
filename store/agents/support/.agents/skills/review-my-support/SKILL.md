---
name: review-my-support
description: "Get a structured readout of how support is going. A weekly rollup that covers every domain with volume, top themes, overdue promises, and churn flags opened. A help-center digest that surfaces ticket themes, request velocity, and the single most useful article to write next. Or a per-account review that maps wins, shipped requests, open friction, and next moves so you walk into the call prepared."
version: 1
category: Support
featured: yes
image: headphone
integrations: [googledocs, notion, slack]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Review My Support

One skill for rollup / readout / review. Branches on `scope`.

## When to use

- **weekly**  -  "Monday review" / "weekly support readout" / "how
  was support week?" / Monday cron routine.
- **help-center-digest**  -  "weekly help-center digest" / "what
  happened in docs this week?" / Sunday cron routine.
- **account-review**  -  "prep account review for {account}" / "outline for check-in
  with {customer}."

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Docs / notes** (Google Docs / Notion)  -  publish the readout where your team will actually read it. Optional, falls back to local markdown.
- **Messaging** (Slack)  -  drop the weekly summary into a team channel. Optional.
- **CRM** (HubSpot / Attio)  -  pull account record for account-review scope. Required for `account-review`.
- **Billing** (Stripe)  -  pull monthly revenue and renewal date for account-review scope. Required for `account-review`.

If you ask for an account review and your CRM isn't connected I stop and ask you to connect it.

## Information I need

I read your support context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Product surface + plan tier map**  -  Required. Why I need it: rollups group items by domain and tier. If missing I ask: "Which plans do you sell, and roughly what does each one include?"
- **Account-review segment**  -  Required for `account-review`. Why I need it: not every customer gets an account review; I need the line. If missing I ask: "Which customers do you actually do account reviews with  -  enterprise only, anything above a certain monthly revenue?"
- **Review cadence**  -  Required for `weekly`. Why I need it: window for the rollup. If missing I ask: "Do you want this weekly, every other week, or monthly?"

## Parameter: `scope`

- `weekly`  -  rollup across all domains. Volume, top themes,
  unresolved high-priority, churn flags opened, promises due
  this week, next moves grouped by domain. Writes to
  `reviews/{YYYY-MM-DD}.md`.
- `help-center-digest`  -  docs-specific rollup. Ticket volume, top
  3 themes from `patterns.json`, unresolved high-priority items,
  feature-request velocity, churn flags. Writes to
  `digests/{YYYY-MM-DD}.md`.
- `account-review`  -  per-account review. 4 sections: wins (what
  achieved), asks-shipped (requests I shipped), friction
  (still-open pains), next moves (renewal / expansion /
  investment). Writes to `account-reviews/{account}-{YYYY-MM-DD}.md`.

## Steps
<!-- houston-workflow:v1 -->

1. **Read `context/support-context.md`.** If missing, stop.
2. **Read ledger.** Fill gaps.
3. **Branch on `scope`:**
   - `weekly`: read `outputs.json` filtered to last 7 days.
     Group by `domain`. Per domain: count + 1-line headline +
     1 unresolved. Read `followups.json` filtered to due this week.
     Read `churn-flags.json` filtered to opened this week. End with
     "2-3 things I recommend you do this week" across whole
     agent.
   - `help-center-digest`: read `conversations.json` counts for
     window, `patterns.json` top 3 themes, `requests.json`
     velocity, `known-issues.json` state changes. Surface
     single most useful docs gap to write next.
   - `account-review`: chain `look-up-a-customer view=timeline` for account.
     Read `requests.json` + `bug-candidates.json` + `followups.json`
     filtered to account. Structure doc as wins /
     asks-shipped / friction / next moves, each section grounded
     in timeline + request IDs.
4. **Write artifact** atomically.
5. **Append to `outputs.json`** with `type` =
   `weekly-review` | `help-center-digest` | `account-review`,
   `domain: "quality"` (for `weekly` / `help-center-digest`) or
   `domain: "success"` (for `account-review`), title, summary, path.
6. **Summarize to me**: 2-minute scan. For `weekly` / `digest`,
   always surface  -  quiet week also news.

## Outputs

- `reviews/{YYYY-MM-DD}.md` (for `scope = weekly`)
- `digests/{YYYY-MM-DD}.md` (for `scope = help-center-digest`)
- `account-reviews/{account}-{YYYY-MM-DD}.md` (for `scope = account-review`)
- Appends to `outputs.json`.

## What I never do

- Invent numbers to pad quiet week. Low volume, write it.
- Include "next moves" without grounding in specific output
  or ticket id.
