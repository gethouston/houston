---
name: prep-an-investor-package
description: "Draft the package you need for your board or your investors without starting from a blank page. Pick what you need: a board pack with the standard 8 sections (TL;DR, business update, metrics, goals, wins, challenges, asks, appendix); or a monthly or quarterly investor update written in your voice grounded in real goal movement, decisions, and metrics. I flag every TBD instead of inventing numbers."
version: 1
category: Operations
featured: no
image: clipboard
integrations: [googledocs, googledrive, notion]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Prep An Investor Package

One skill, two founder-voice artifacts  -  board pack and investor update. Both opinionated assembly on data you have: goals, decisions, metrics, wins, challenges.

## When to use

- `type=board-pack`  -  "prep the Q{N} board pack" / "build the {yyyy-qq} board pack" / board meeting 2+ weeks out per investor cadence.
- `type=investor-update`  -  "draft the monthly investor update" / "write the Q{N} investor letter" / update due per cadence.

## Connections I need

I run external work through Composio. Before this skill runs I check the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Docs / notes** (Google Docs, Notion)  -  Optional. If connected I mirror the draft so you can edit and share without leaving your usual tool.
- **Files** (Google Drive)  -  Optional. Lets me drop a copy in the right shared folder.
- **Warehouse / data source**  -  Optional. Lets me refresh metric numbers if `set-up-tracking` snapshots are stale.

This skill works without any connection  -  board packs and investor updates draft locally first. I never block here.

## Information I need

I read your operations context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Company snapshot**  -  Required. Why I need it: the opening paragraph leans on stage, pitch, and what's true today. If missing I ask: "In one or two sentences, what does the company make, who is it for, and where are you today?"
- **Your voice**  -  Required. Why I need it: investor updates have to sound like you, not a template. If missing I ask: "Best is to connect your inbox so I can sample 20 to 30 sent messages. Otherwise paste 3 to 5 emails or letters you've written that sound like you."
- **Investor cadence**  -  Required. Why I need it: monthly versus quarterly changes scope, length, and what counts as a win. If missing I ask: "How often do you update investors  -  monthly, quarterly, both? And which investors get it?"
- **Reporting period**  -  Required. Why I need it: anchors the metric pulls and decision window. If missing I ask: "What period is this update covering  -  last month, last quarter, year to date?"
- **Latest goal snapshot, decisions, and metrics**  -  Required. Why I need it: I assemble from your saved work, never invent. If missing I ask: "Want me to refresh your goals and metrics first? The pack will be richer."

## Parameter: `type`

- `board-pack`  -  8-section deck draft for quarterly board meeting. Output: `board-packs/{yyyy-qq}/board-pack.md` (+ optional Google Doc mirror via Composio if connected).
- `investor-update`  -  CEO-voice narrative for monthly or quarterly update. Output: `investor-updates/{yyyy-qq}/update.md`.

## Steps
<!-- houston-workflow:v1 -->

1. Read `config/context-ledger.json`. Fill gaps with ONE modality-ranked question.
2. Read `context/operations-context.md`  -  active priorities, operating rhythm, hard nos, voice notes. Anchors what "progress" means.
3. Gather source data:
   - Latest goal snapshot from `goal-history.json` (from `track-my-goals`). Compute movement vs prior period.
   - Decisions in `decisions.json` + per-decision notes in `decisions/{slug}/` within reporting period.
   - Metric values from `metrics-daily.json` (from `set-up-tracking`) and `rollups/` (from `run-my-ops-review period=metrics-rollup`).
   - Weekly reviews in `reviews/` for period.
   - Open anomalies from `anomalies.json`.
   - Bottlenecks from `bottlenecks.json`.

4. Branch on `type`:

   **If `type = board-pack`:**
   - Draft 8-section pack:
     1. **TL;DR**  -  one page, 3-5 bullets: biggest movement, biggest ask, biggest risk.
     2. **Business update**  -  narrative, 300-500 words. Shipped, matters, next.
     3. **Metrics**  -  table of tracked metrics: current / prior-period / direction / commentary.
     4. **Goals**  -  goal-metric-level status (on-track / at-risk / off-track) with root cause for off-track.
     5. **Wins**  -  3-5 specific wins, each with metric or decision anchor.
     6. **Challenges**  -  2-4 specific challenges, each with hypothesis and what we're trying.
     7. **Asks**  -  explicit board asks (intros, advice, decisions).
     8. **Appendix**  -  links to decision records, detailed queries, weekly reviews.
   - Flag every unfilled field with `TBD  -  {what you need to bring}`. Never invent numbers.

   **If `type = investor-update`:**
   - Draft CEO-voice narrative (~600-900 words):
     - Opening: one paragraph, stage + what's true today.
     - Highlights: 3-5 bullets of movement (metric / decision / launch).
     - Lowlights: 1-2 honest items with mitigation.
     - Goal metric status block: one-line per goal metric with direction.
     - Asks: 2-3 specific items  -  intros, advice, sounding-board time.
     - Closing: one paragraph, next-period focus.
   - Voice-match against `config/voice.md` + priorities from `context/operations-context.md`.
   - Flag every TBD.

5. Write atomically (`.tmp` → rename) to path.
6. If `googledocs` or `notion` connected and opted in, mirror draft to preferred format with link back.
7. Append to `outputs.json` with `{id, type, title, summary, path, status: "draft", createdAt, updatedAt, domain: "planning"}`. Type = `"board-pack"` or `"investor-update"`.
8. Summarize: path + every flagged TBD + one thing to review first (e.g. "Challenges section  -  pricing-page drop hypothesis is mine, not yours; sanity-check before sending").

## Outputs

- `board-packs/{yyyy-qq}/board-pack.md` (+ optional Google Doc mirror).
- `investor-updates/{yyyy-qq}/update.md` (+ optional Google Doc mirror).
- Appends to `outputs.json`.

## What I never do

- Send, publish, share. Drafts only  -  you review, edit, send.
- Invent metrics, quotes, or movement without evidence. TBD not failure, it's honest state.
- Promise outcomes. "We'll hit {goal metric} by {date}" → only if you said it.
- Touch investor records in CRM.