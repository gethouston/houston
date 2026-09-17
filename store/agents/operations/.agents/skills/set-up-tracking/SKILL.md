---
name: set-up-tracking
description: "Set up the operational tracking you need so you're not flying blind. Pick what you need: a single metric I snapshot daily against your warehouse, or a full dashboard spec with sections, visualizations, cadence, and read-only SQL behind every chart. I draft the spec, you or your BI tool renders it."
version: 1
category: Operations
featured: no
image: clipboard
x_houston:
  created_by: houston
  skill_schema: 1
---


# Set Up Tracking

One skill for the tracking you need. `scope` param picks the shape: a single metric definition with daily snapshots, or a full dashboard spec (sections + visualizations + cadence + SQL per viz). Both write read-only SQL only and ground in your operating context.

## Parameter: `scope`

- `metric`  -  define a single metric, write the read-only SQL against your warehouse, snapshot the current value into `metrics-daily.json`, append the definition to `config/metrics.json`, and register it for the chosen cadence. Output: appended `config/metrics.json` + `metrics-daily.json` + `queries/{metric-slug}/`.
- `dashboard`  -  propose 2-4 sections, per-section visualizations, cadence, and the read-only SQL behind each viz. Spec only  -  you or your BI tool renders. Output: `config/dashboards.json` (appended or updated by id).

User names scope in plain English ("track monthly revenue", "watch weekly active users", "spec a growth dashboard", "I want to see retention regularly") -> infer. Ambiguous -> ask ONE question naming both options.

## When to use

**metric:**
- "start tracking {X}" / "add {metric} to the dashboard" / "watch {key metric}"
- A user-named metric on `onboard-me` has an empty `sqlSnippet` placeholder, user invokes this skill to build the real definition.

**dashboard:**
- "spec me a dashboard for {X}"
- "I want to see {metric group} regularly"
- "build a dashboard for the {growth / retention / churn / revenue} team"

## Connections I need

I run external work through Composio. Before this skill runs I check the categories below are linked. Missing -> I name the category, ask you to connect it from the Integrations tab, stop.

- **Warehouse / data source** (Postgres, BigQuery, Snowflake, Redshift)  -  Required for `scope=metric` (I can't snapshot a metric without a source to read from). Optional for `scope=dashboard` (lets me write SQL snippets that run on your real schema; without it I leave parameterized placeholders).
- **Billing** (Stripe)  -  Optional for `scope=metric`. Lets me wire revenue metrics straight from billing instead of inferring from the warehouse.

For `scope=metric` I stop if no warehouse is connected. For `scope=dashboard` I never block  -  it produces a spec, not a rendered dashboard.

## Information I need

I read your operations context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Metric definition**  -  Required for `scope=metric`. Why I need it: 'monthly revenue' could mean billing-based, contract-based, or annual revenue / 12  -  I need to know which. If missing I ask: "What exactly does this metric mean? For revenue: are you counting active subscriptions, recognized revenue, or something else?"
- **Where this metric lives**  -  Required for `scope=metric`. Why I need it: I need the source of truth to write SQL against. If missing I ask: "Which system is the source of truth for this number  -  your warehouse, your billing tool, your product database?"
- **Direction and unit**  -  Required for `scope=metric`. Why I need it: drives classification (improved / degraded) and formatting. If missing I ask: "Is higher better, lower better, or is there a target? And is it a count, dollar amount, percent, or something else?"
- **Cadence**  -  Optional for `scope=metric`. Why I need it: how often I snapshot. If you don't have it I keep going with daily as the default.
- **Dashboard purpose**  -  Required for `scope=dashboard`. Why I need it: a growth dashboard and a retention dashboard get different sections. If missing I ask: "What is this dashboard for, and what would you do with it?"
- **Audience and cadence**  -  Required for `scope=dashboard`. Why I need it: shapes layout and refresh frequency. If missing I ask: "Who's looking at this and how often  -  you daily, your team weekly, the board monthly?"
- **What you're already tracking**  -  Required for `scope=dashboard`. Why I need it: I prefer to wire dashboards to metrics you already snapshot rather than make up new ones. If missing I ask: "Which numbers do you already watch most closely?"
- **Active priorities**  -  Required for `scope=dashboard`. Why I need it: drives which metrics belong on the top tile. If missing I ask: "What are the 2 to 3 things the company is pushing on this quarter?"

## Steps
<!-- houston-workflow:v1 -->

### Shared steps (both scopes)

1. **Read `context/operations-context.md`.** If missing or empty, stop. Ask user to run `set-up-my-ops-info` first.

### Branch on `scope`:

#### `metric`

2. **Clarify if needed.** If phrasing ambiguous ("monthly revenue" could be billing-based, contract-based, or annual revenue / 12), ask ONE tight question. Else proceed.

3. **Identify source.** Read `config/data-sources.json`. If user didn't name source, pick most likely from `config/business-context.md` (warehouse for core business metrics, product DB for engagement).

4. **Check existing metrics.** Read `config/metrics.json`. If a metric with the same slug or overwhelmingly similar name exists, tell user, offer update instead of duplicate.

5. **Confirm schema.** Read `config/schemas.json` for referenced tables. If entries missing, lazy-introspect (same pattern as `ask-a-data-question` step 3).

6. **Draft SQL.** Return `SELECT` resolving to single numeric value for given date. Use `{{date}}` placeholder, scheduler substitutes at run time. Example (BigQuery dialect):

   ```sql
   SELECT SUM(amount) AS value
   FROM `project.dataset.subscriptions`
   WHERE state = 'active'
     AND start_date <= DATE('{{date}}')
     AND (end_date IS NULL OR end_date > DATE('{{date}}'))
   ```

7. **Self-check read-only.** Scan for forbidden DML/DDL keywords. Refuse if any appear.

8. **Capture cadence, direction, unit.** Ask ONE question if not specified:
   - `cadence: "daily"` default.
   - `direction`  -  higher-is-better / lower-is-better / target-is-best.
   - `unit`  -  count / currency / percent / ratio / duration / other.
   Do NOT hardcode thresholds  -  leave `thresholds` empty; if user wants custom sigma for anomaly detection, override later.

9. **Append metric definition** to `config/metrics.json`. Also register reusable query under `queries/{metric-slug}/` for audit (`ask-a-data-question` reuses it). Update `queries.json`.

10. **Snapshot now.** Execute SQL with `{{date}}` = today (warehouse timezone, default UTC). Append to `metrics-daily.json` with `{ id, metricId, date, value, changeVsPrev, changeVs7dAvg, changeVs28dAvg, createdAt }`. First-snapshot change fields null.

11. **Backfill if asked.** If user said "backfill last N days," loop SQL across dates, append each snapshot. Warn on cost first (compare total estimated scanned bytes vs ceiling).

12. **Append to `outputs.json`** with `type: "metric-definition"`, status "ready".

13. **Report.** Current value + cadence + where it shows on dashboard + note that `analyze-my-data subject=anomaly` flags deviations after >= 7 snapshots accumulate.

#### `dashboard`

2. **Clarify audience + cadence.** If unclear: "Who's looking at this and how often? (operator daily / exec weekly / growth team daily / on-demand)." Defaults: `audience: "operator"`, `cadence: "daily"`.

3. **Propose metric list.** From `config/metrics.json`, pick metrics that fit purpose. If user named untracked metrics, include as placeholders with `sqlSnippet: ""` and recommend running this skill with `scope=metric` first.

4. **Design sections.** 2-4 sections max. Canonical shape:
   - **Top-line key metrics**  -  3-5 single-number tiles for must-knows.
   - **Trends**  -  30/60/90-day time-series for key metrics.
   - **Breakdown**  -  segmented view (segment / product area / cohort / channel).
   - **Anomalies / alerts** (optional)  -  latest flagged outliers from `anomalies.json`.

5. **Per-viz details.** Each visualization specify:
   - `title`
   - `chart`: `line` | `bar` | `number` | `sparkline` | `funnel` | `table`
   - `metricId` if maps to tracked metric
   - `sqlSnippet`  -  parameterized read-only SQL using `{{date}}` / `{{startDate}}` / `{{endDate}}` placeholders
   - `notes`  -  interpretation caveats or known DQ flags

6. **Self-check read-only.** Every `sqlSnippet` must be SELECT-only. Scan for forbidden DML/DDL keywords, refuse if any appear.

7. **Write spec** to `config/dashboards.json` (atomic). Append or update by `id`:

   ```json
   {
     "id": "growth-daily",
     "name": "Growth Daily",
     "audience": "growth team",
     "cadence": "daily",
     "sections": [
       {
         "title": "Top-line",
         "visualizations": [
           {
             "metricId": "signups",
             "title": "Signups (today)",
             "chart": "number",
             "sqlSnippet": "SELECT COUNT(*) AS value FROM events WHERE event='signup' AND DATE(ts) = DATE('{{date}}')",
             "notes": "Excludes bots flagged in users.is_bot"
           }
         ]
       }
     ],
     "createdAt": "...",
     "updatedAt": "..."
   }
   ```

8. **Append to `outputs.json`** with `type: "dashboard-spec"`, status "ready".

9. **Report.** Present spec in chat, one-line summary per section. Next step: "Paste this spec into your BI tool or ask me to translate a specific viz for {your tool}."

## What I never do

- **Hardcode sigma threshold.** Per-metric overrides live in `config/metrics.json` -> `thresholds`. Default 2-sigma lives in `analyze-my-data subject=anomaly`'s documented default  -  not baked into metric records.
- **Execute DML/DDL.** Read-only rule applies to every SQL snippet, every metric query, every viz query. Forbidden-keyword scan refuses anything else.
- **Snapshot without a fresh value.** If query returns NULL, record snapshot with `possibleCauses` note in next anomaly sweep, tell user.
- **Render an HTML / rendered dashboard.** Spec only  -  the Houston agent view is separate, covers operator view. Your BI tool renders this spec.
- **Assume a specific BI tool.** Spec is tool-agnostic with parameter placeholders.

## Outputs

- `scope=metric`:
  - Updated `config/metrics.json`
  - Appended `metrics-daily.json` rows
  - New `queries/{metric-slug}/query.sql`, `notes.md`
  - Updated `queries.json`
  - Possibly updated `config/schemas.json`
  - Appends to `outputs.json` with `type: "metric-definition"`.
- `scope=dashboard`:
  - Updated `config/dashboards.json`
  - Appends to `outputs.json` with `type: "dashboard-spec"`.
