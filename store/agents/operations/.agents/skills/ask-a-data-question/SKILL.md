---
name: ask-a-data-question
description: "Ask any question about your data in plain English and get a real answer. I translate to read-only SQL against your connected warehouse, warn you before anything expensive runs, execute, save the query for reuse, and return the result with caveats called out so you don't ship a number that's quietly wrong."
version: 1
category: Operations
featured: no
image: clipboard
x_houston:
  created_by: houston
  skill_schema: 1
---


# Ask A Data Question

## When to use

User asked data question. Anything phrased "how many," "what's," "top N by," "trend of," "compare X to Y," "why did Z change." Translate to SQL, run safely, return result with citations.

## Connections I need

I run external work through Composio. Before this skill runs I check the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Warehouse / data source** (Postgres, BigQuery, Snowflake, Redshift)  -  Required. I run read-only SQL here. No warehouse means no answer.

If no warehouse is connected I stop and ask you to connect your warehouse first.

## Information I need

I read your operations context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Where the data lives**  -  Required. Why I need it: I need to know which warehouse to query and the SQL dialect. If missing I ask: "Where does this data live? Best is to connect your warehouse from the Integrations tab and tell me which one to use."
- **Cost ceilings**  -  Optional. Why I need it: I warn before running anything that would scan more than your ceiling. If you don't have it I keep going with TBD and use a conservative default of 100 GB scanned.
- **Table schemas**  -  Optional. Why I need it: lets me draft accurate SQL without guessing column names. If you don't have it I introspect the warehouse on the fly.
- **Operating context doc**  -  Required. Why I need it: anchors what "this number looks weird" means against your priorities. If missing I ask: "Want me to set up your operating context first? Helps me catch suspicious results."

## Hard rules

- **Read-only.** Any proposed query containing `INSERT`, `UPDATE`,
  `DELETE`, `MERGE`, `DROP`, `CREATE`, `ALTER`, `TRUNCATE`, `GRANT`,
  or `REVOKE` refused immediately.
- **Warn before executing potentially expensive query.** Use
  warehouse explain / dry-run tool (discover via `composio search
  warehouse explain` or provider equivalent) to estimate
  scanned bytes + runtime. Compare against
  `config/data-sources.json` → `costCeilingScannedGb` and
  `costCeilingSeconds` for target source. If exceeded,
  state estimate, wait for explicit approval.
- **Every result ships with**: exact SQL, run timestamp,
  row count, any data-quality caveats.

## Steps
<!-- houston-workflow:v1 -->

1. **Read `context/operations-context.md`.** If
   missing/empty, stop, ask user run `set-up-my-ops-info` skill first. Priorities + tools anchor which
   source to use, what "this number looks weird" means.

2. **Identify source.** Read `config/data-sources.json`. If
   empty/incomplete, ask ONE question: "Where does this live?
   *Best  -  connect your warehouse via Composio and tell me the name.
   Or describe the table and I'll flag this as unverified until
   connected.*" Write, continue.

3. **Lazy schema introspection.** Read `config/schemas.json`. For
   tables likely needed, if entry missing or
   `lastIntrospectedAt` older than 7 days, run warehouse
   schema introspection tool (discover via `composio search`) to
   pull columns, types, nullability, primary key hints. Append to
   `config/schemas.json`. If introspection blocked (no
   warehouse connected), ask user link one, stop  -  no
   guessing column names.

4. **Draft SQL.** Use dialect from
   `config/data-sources.json`. Prefer CTEs for readability. Apply
   partition / cluster / date filters when available. Generate
   kebab-case slug from question purpose (e.g.
   `weekly-signups-last-7d`).

5. **Self-check against hard rules.** Scan query text for
   forbidden keywords (case-insensitive). If found, refuse,
   stop.

6. **Estimate cost.** Run warehouse explain / dry-run tool.
   Compare to ceilings in `config/data-sources.json` for this
   source. If over ceiling:

   > "This will scan ~{bytes human} (~{rows})  -  run it?"

   Wait for approval. Else continue.

7. **Execute via Composio.** Run query through connected
   warehouse tool (slug discovered via `composio search
   warehouse`). On success, capture result rows (cap at 10,000 for
   local storage; record real row count separately).

8. **Capture data-quality caveats.** Check result for null
   percentages on key columns, suspiciously round numbers, zero-row
   returns where user expected data, ranges that look off
   (negative counts, future-dated events). List any in `notes.md`
    -  never hide concern.

9. **Save as reusable.** Write atomically:
   - `queries/{slug}/query.sql`  -  query body.
   - `queries/{slug}/result-latest.csv`  -  result.
   - `queries/{slug}/notes.md`  -  purpose, parameters, schema deps,
     caveats, last-run metadata (timestamp, row count, scanned
     bytes).

10. **Update `queries.json`.** Read-merge-write. Upsert by slug.
    Set `{ purpose, author: "agent", sourceId, schemaDeps, tags,
    costWarning, lastRunAt, lastRowCount }`.

11. **Append to `outputs.json`** with `type: "query-answer"`,
    status "ready".

12. **Return answer in chat.** Format:

    ```
    {plain-English answer, 1–3 sentences}

    Query: `queries/{slug}/query.sql`
    Ran at: {ISO-8601}
    Rows: {N}
    Caveats: {bulleted or "none"}
    ```

## Outputs

- `queries/{slug}/query.sql` (new or overwritten)
- `queries/{slug}/result-latest.csv` (overwritten)
- `queries/{slug}/notes.md` (new or overwritten)
- Updated `queries.json`
- Possibly updated `config/schemas.json` (lazy introspection)
- Appends to `outputs.json` with `type: "query-answer"`.

## What I never do

- **Run DML/DDL**  -  refuse, stop.
- **Execute over cost ceiling** without explicit approval.
- **Hide caveat**  -  every notable concern lands in `notes.md`.
- **Invent column/table names**  -  if introspection blocked,
  stop, ask for connection.