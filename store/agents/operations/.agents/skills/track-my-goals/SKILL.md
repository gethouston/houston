---
name: track-my-goals
description: "See where you actually stand on your goals without piecing it together by hand. I refresh each goal metric's current value from your connected goal tracker, classify on-track / at-risk / off-track against the expected attainment curve, and surface likely root causes from linked decisions and priorities. Run it weekly or whenever someone asks how the quarter's going."
version: 1
category: Operations
featured: no
image: clipboard
integrations: [googlesheets, notion, airtable, linear, linkedin]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Track My Goals

## When to use

- User ask goal status, want refresh, or ask "what off-track."
- Weekly / quarterly cadence  -  if last snapshot in
  `goal-history.json` older than 10 days.
- Start of new quarter  -  rebaseline.
- Pulled implicitly by `prep-an-investor-package`
  when latest snapshot stale.

## Connections I need

I run external work through Composio. Before this skill runs I check the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Goal tracker** (Notion, Airtable, Google Sheets, Linear)  -  Required if your goals live in one of these. Pulls the latest current values per goal metric.
- **Warehouse / data source**  -  Optional. If a goal metric maps to a tracked metric I read the latest value from there for consistency.

If your goals live in a connected tool but nothing's connected, I stop and ask you to connect your goal tracker first.

## Information I need

I read your operations context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your goals**  -  Required. Why I need it: I refresh existing goals, I don't invent them. If missing I ask: "Where do your goals live? Best is to connect the tool where they're tracked. Otherwise drop the doc or paste them and I'll capture the structure."
- **Active priorities**  -  Required. Why I need it: drives the 'likely root cause' attribution for off-track goal metrics. If missing I ask: "What are the 2 to 3 things the company is pushing on this quarter?"
- **Goal metric owners**  -  Optional. Why I need it: when I can't read a number from a connected source I tell you which owner to ping. If you don't have it I keep going with TBD and ask before inventing.
- **Attainment curve**  -  Optional. Why I need it: front-loaded versus back-loaded goal metrics classify differently mid-quarter. If you don't have it I keep going with TBD using a linear default.

## Steps
<!-- houston-workflow:v1 -->

1. **Read `context/operations-context.md`.** If
   missing or empty, stop and ask you run
   `set-up-my-ops-info` first. Active priorities
   drive "likely root cause" attribution for off-track goal metrics.

2. **Read `config/goals.json`.** If missing or empty, ask ONE
   targeted question: *"No goals yet  -  best: if goal tracker
   connected via Composio, point me at it and pull current state.
   Otherwise paste or drop goal doc.
   If no goals yet, fine  -  say so and help
   draft starter set."* Write and continue.

3. **For each objective, refresh each goal metric current value.** In
   order of preference:
   - **Connected goal tracker via Composio**  -  `composio search goal`
     (or category user named during onboarding). Pull
     latest `current` per goal metric.
   - **metric-tracking handoff**  -  if goal metric maps to tracked metric
     in this agent, cite query slug and read
     latest value from `metrics-daily.json`. Keeps
     numbers consistent across agents.
   - **Ask owner**  -  if neither available, tell you
     which owners to ping and stop short of inventing numbers.

4. **Snapshot to `goal-history.json`.** Append one record per
   objective (or per-goal-metric if owner updates goal-metric-scoped) with
   `{ objectiveId, date, goalMetrics: [{ id, value, state }], state,
   createdAt }`. Date today (YYYY-MM-DD).

5. **Classify each goal metric against target.** Pull expected
   attainment curve from goal metric record (`linear` default unless
   user declared front-/back-loaded during onboarding or
   prior refresh). For today's point in period:
   - `on-track`  -  `current / target` ≥ `expected-for-this-point`.
   - `at-risk`  -  within 20 percentage points of expected but below.
   - `off-track`  -  more than 20 percentage points below expected.

   20-pp threshold = documented default; user can override
   per-goal-metric in `config/goals.json`.

6. **Roll goal metric states up to objective state.** If any goal metric
   `off-track`, objective `off-track`. If any `at-risk` and
   none `off-track`, objective `at-risk`. Else `on-track`.
   Update `config/goals.json` with new state + fresh `current`
   values.

7. **Attach reason codes from linked decisions.** For each at-risk
   / off-track goal metric:
   - Scan `decisions.json` for decisions where
     `linkedInitiativeSlugs` includes same slug goal metric references
     (if any)  -  recent pending decision on linked initiative =
     likely cause.
   - Check operating-context priorities  -  if goal metric tied to
     inactive priority, surface that.
   - Record reason in goal metric `reason` field in
     `config/goals.json`.

8. **Report in chat.**

   ```
   Goal refresh  -  {YYYY-MM-DD}

   On-track: {N}  |  At-risk: {N}  |  Off-track: {N}

   Off-track:
   - {objective}  -  {goal metric}: {current}/{target} {unit} ({% attained}).
     Likely cause: {linked decision slug or priority note}.

   At-risk:
   - ...

   (Full history in `goal-history.json`.)
   ```

9. **Hand-off hint.** If anything flipped to off-track this cycle,
   offer: "Want me run `find-my-bottlenecks` to see if pattern
   cross-goal? Or hand off-track goal metric to me to nudge the owner?"

10. **Append to `outputs.json`** with `type: "goal-snapshot"`,
    status "ready".

## Outputs

- Appended `goal-history.json`
- Updated `config/goals.json` (fresh current values + state per
  objective + per-goal-metric reason for at-risk / off-track)
- Appends to `outputs.json` with `type: "goal-snapshot"`.

## What I never do

- **Invent goal metric value**  -  if no source available, stop and
  tell you which owners to ping.
- **Hardcode at-risk threshold**  -  20-pp = documented
  default; per-goal-metric overrides live in `config/goals.json`.
- **Modify goal definitions silently**  -  if user adds new
  objective via chat, confirm shape before writing.
