---
name: analyze-my-data
description: "Get a rigorous readout on what your data is actually telling you. Pick what you need: an experiment readout with lift, significance, confidence intervals, and an explicit ship / kill / iterate / inconclusive call; an anomaly sweep that flags metrics deviating past rolling baselines with hypothesized causes; or a data-quality audit that checks nulls, dupes, freshness, and referential integrity on the tables you care about."
version: 1
category: Operations
featured: no
image: clipboard
x_houston:
  created_by: houston
  skill_schema: 1
---


# Analyze My Data

One analytical primitive. Three data jobs: experiment readouts, anomaly sweeps, DQ audits. Rigorous default  -  never SHIP without significance, never call anomaly without baseline, never skip caveats on DQ findings.

## When to use

- `subject=experiment`  -  "analyze test {X}" / "how did the {Y} experiment do" / "readout on the A/B test".
- `subject=anomaly`  -  "anything weird in the data today" / "anomaly check" / "daily anomaly sweep" / "why did {metric} spike".
- `subject=data-qa`  -  "check data quality on {table}" / "why is this number off" / "run DQ on the warehouse".

## Connections I need

I run external work through Composio. Before this skill runs I check the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Warehouse / data source** (Postgres, BigQuery, Snowflake, Redshift)  -  Required. Read-only SQL for variant pulls, anomaly baselines, DQ checks.
- **Experiment platform** (PostHog, Mixpanel, Amplitude)  -  Optional. Used when `subject=experiment` and the test lives in a product analytics tool. If none connected I work from pasted aggregates.

If no warehouse connected I stop and ask you to connect your warehouse first.

## Information I need

I read your operations context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Company stage**  -  Required. Why I need it: sets sensible defaults for sample size and minimum detectable effect on experiments. If missing I ask: "How would you describe your stage right now  -  pre-launch, early users, scaling, or steady?"
- **Where your business data lives**  -  Required. Why I need it: I have to know which warehouse to query. If missing I ask: "Where does your business data live? Best is to connect your warehouse from the Integrations tab so I can read it directly."
- **What you're already tracking**  -  Required for `subject=anomaly`. Why I need it: I sweep the metrics you already watch and flag deviations. If missing I ask: "Which numbers do you watch most closely? You can list them or, even better, connect the dashboard where they live."
- **Table shapes and freshness expectations**  -  Optional for `subject=data-qa`. Why I need it: helps me know which columns shouldn't be null and how stale a table is allowed to get. If you don't have it I keep going with TBD and infer from a sample.

## Parameter: `subject`

- `experiment`  -  analyze one test. Inputs: variant data (warehouse query or paste), hypothesis, primary metric, guardrails. Output: `analyses/experiment-{slug}-{YYYY-MM-DD}.md` with ship / kill / iterate / inconclusive-extend call.
- `anomaly`  -  sweep every metric in `config/metrics.json` with ≥7 snapshots; flag deviations past per-metric threshold or default (2σ yellow / 3σ red). Output: `analyses/anomaly-sweep-{YYYY-MM-DD}.md` + upsert `anomalies.json`.
- `data-qa`  -  read-only DQ checks on target tables: nulls per column, dups on natural keys, freshness (MAX(updated_at) vs expected staleness), referential integrity on key joins, cardinality surprises. Output: `data-quality-reports/{YYYY-MM-DD}/report.md`.

## Steps
<!-- houston-workflow:v1 -->

1. Read `config/context-ledger.json`; fill gaps with ONE modality-ranked question.
2. Read `context/operations-context.md`  -  active priorities + hard nos anchor what counts as "material".
3. Branch on `subject`:

   **If `subject = experiment`:**
   - Read hypothesis, variants, primary metric, guardrails. If missing, ask in one turn (hypothesis + control + variant + primary metric + guardrails).
   - Pull variant data via warehouse (read-only SQL) or accept pasted aggregates.
   - Compute: lift (variant vs control), significance (z-test for proportions, t-test for continuous), 95% CI, observed MDE, guardrail deltas.
   - Make call:
     - SHIP  -  primary moves p < 0.05, guardrails clean, CI lower bound > practical MDE.
     - KILL  -  primary flat OR guardrails degrade materially.
     - ITERATE  -  directional, not yet significant, guardrails clean; spec next variant.
     - INCONCLUSIVE-EXTEND  -  too low power; compute run length needed.
   - Write readout: every number, call, reasoning.

   **If `subject = anomaly`:**
   - Read `config/metrics.json`; for each metric with ≥7 snapshots, compute 7-day + 28-day rolling baselines.
   - Compare latest vs baselines; flag past per-metric threshold or default (2σ / 3σ).
   - For each flagged metric, hypothesize 1-3 causes from: recent decisions in `decisions.json`, recent deploys in `context/operations-context.md`, recent experiments in `outputs.json`, known seasonal patterns.
   - Upsert `anomalies.json` with `{id, metric, severity, observedAt, baseline, deviation, hypotheses[], status: "open"}`.

   **If `subject = data-qa`:**
   - Read `config/schemas.json` for target tables (or whole warehouse if "everything").
   - Per table:
     - Nulls per column (vs expected).
     - Dups on natural key.
     - Freshness: `MAX(updated_at)` vs staleness expectation.
     - Referential integrity on key joins (FK orphans).
     - Cardinality surprises (value count drift vs baseline).
   - Dated report: pass / warn / fail per check + SQL used + suggested fix per fail.

4. Write atomically (`.tmp` → rename) to path.
5. Append `outputs.json` with `{id, type, title, summary, path, status, createdAt, updatedAt, domain: "data"}`. Type = `"experiment-readout"` / `"anomaly-sweep"` / `"data-qa-report"`.
6. Summarize: experiments → call + one-sentence reason; anomalies → count + top 3 by severity; DQ → fail count + first to fix.

## Outputs

- `analyses/experiment-{slug}-{YYYY-MM-DD}.md` (experiment)
- `analyses/anomaly-sweep-{YYYY-MM-DD}.md` + `anomalies.json` upsert (anomaly)
- `data-quality-reports/{YYYY-MM-DD}/report.md` (data-qa)
- Appends `outputs.json`.

## What I never do

- Recommend SHIP without significance.
- Call anomaly without showing baseline.
- Run DML / DDL  -  read-only only.
- Hide caveats (sample size, seasonality, missing data) behind headline number.