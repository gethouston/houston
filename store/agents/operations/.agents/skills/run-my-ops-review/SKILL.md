---
name: run-my-ops-review
description: "Roll up what shipped and what moved across your whole ops surface. Pick what you need: a weekly review that aggregates every skill's output, cross-references priorities and renewals, flags gaps, and recommends the one move; or a metrics-rollup that walks every tracked metric, computes week-over-week change, and surfaces what to look at first."
version: 1
category: Operations
featured: yes
image: clipboard
integrations: [googlesheets]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Run My Ops Review

Cross-cutting Monday ritual. Two sub-reviews behind one primitive  -  usually want weekly review Mondays, wire metrics rollup into it.

## When to use

- `period=weekly`  -  "Monday ops review" / "weekly readout" / "what happened across my ops this week".
- `period=metrics-rollup`  -  "weekly metrics readout" / "how's the business doing this week" / "give me the data for the Monday review".

## Connections I need

I run external work through Composio. Before this skill runs I check the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Warehouse / data source**  -  Required for `period=metrics-rollup`. Pulls fresh metric snapshots if the daily ones are stale.
- **Goal tracker** (Notion, Airtable, Google Sheets)  -  Optional. Lets the weekly review reflect current goal state without a manual refresh.

This skill works without any connection for the weekly review  -  it leans on your saved work. I only block on `metrics-rollup` if no warehouse is connected.

## Information I need

I read your operations context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Active priorities**  -  Required. Why I need it: the gaps-vs-priorities section keys off these. If missing I ask: "What are the 2 to 3 things the company is pushing on this quarter?"
- **Operating rhythm**  -  Required. Why I need it: makes "Monday review" mean the right thing for your week. If missing I ask: "What does your week look like  -  review day, deep-work days, meeting days?"
- **What you're tracking**  -  Required for `period=metrics-rollup`. Why I need it: the rollup walks every metric you watch. If missing I ask: "Which numbers do you watch most closely? Best is to connect the dashboard or warehouse where they live."
- **Investor cadence**  -  Optional. Why I need it: lets the review flag upcoming investor or board deadlines. If you don't have it I keep going with TBD and skip the deadline section.

## Parameter: `period`

- `weekly`  -  founder's Monday review. Aggregates last 7 days of `outputs.json` across every skill in agent, cross-references active priorities + renewal calendar, flags gaps, surfaces next moves. Output: `reviews/{YYYY-MM-DD}.md`.
- `metrics-rollup`  -  cross-metric weekly pulse. Reads every tracked metric, computes week-over-week change, classifies vs direction, flags open anomalies. Feeds `weekly` review. Output: `rollups/{YYYY-MM-DD}.md`.

## Steps
<!-- houston-workflow:v1 -->

1. Read `config/context-ledger.json`. Fill gaps with ONE modality-ranked question.
2. Read `context/operations-context.md`  -  active priorities, operating rhythm, key contacts, vendor posture, hard nos.
3. Branch on `period`:

   **If `period = metrics-rollup`:**
   - Read `config/metrics.json` for metric registry.
   - Each metric, read last 14 snapshots from `metrics-daily.json`.
   - Compute: this-week value, last-week value, WoW delta, WoW %, classification vs declared direction (improved / stable / degraded), note any open anomaly in `anomalies.json`.
   - Rank by biggest movement (absolute WoW%) first, then by priority (metrics tied to active priorities first).
   - Write rollup as scannable table + 2-3 sentence commentary on top 3 movers.

   **If `period = weekly`:**
   - Optionally read latest `rollups/{YYYY-MM-DD}.md` if present  -  if not, consider suggesting `metrics-rollup` run before review, don't block.
   - Scan `outputs.json` for every entry with `updatedAt` in last 7 days. Group by skill / domain.
   - Read `renewals/calendar.md`  -  flag anything renewing in next 30 days.
   - Read `bottlenecks.json` and `decisions.json` (last 30 days).
   - Produce review:
     - **What shipped**  -  by domain (Planning / People / Finance / Vendors / Data), bulleted with paths.
     - **What moved**  -  top 3 metric movers from rollup if available.
     - **What's stale**  -  things started but not touched 3+ weeks.
     - **Gaps vs priorities**  -  each active priority → what we did for it this week → honest verdict (on-track / at-risk / off-track).
     - **Upcoming deadlines**  -  renewals next 30d, investor updates due, board meetings.
     - **The one move**  -  single most useful thing to do this week.

4. Write atomically (`.tmp` → rename) to appropriate path.
5. Append to `outputs.json` with `{id, type, title, summary, path, status: "ready", createdAt, updatedAt, domain: "planning" or "data"}`. Type = `"weekly-review"` or `"metrics-rollup"`.
6. Summarize to you: one move (weekly) or top 3 movers (rollup).

## Outputs

- `reviews/{YYYY-MM-DD}.md` (weekly)
- `rollups/{YYYY-MM-DD}.md` (metrics-rollup)
- Appends to `outputs.json`.

## What I never do

- Claim progress on priority I can't evidence in `outputs.json`.
- Invent metric movement  -  if data missing, I say so.
- Replace decision ledger  -  if review surfaces decision-shaped item, flag as `log-a-decision` candidate; don't record as one.