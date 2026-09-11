---
name: airtable-lead-loader
description: Create a new Airtable table with the full lead-tracking schema (lead fields + enrichment fields + outreach status) and batch-load records from a scrape file. Uses 4 parallel agents to load 4x faster, working around Airtable's one-record-per-call limit. Phase 2 of both pipelines, also runnable standalone if you have a JSON list of leads.
version: 1
tags: []
last_used: 2026-06-06
category: Outbound
integrations: [airtable]
image: card-index-dividers
---

# Airtable Lead Loader

Create a fresh Airtable table for a list of leads, with all the columns the rest of the pipeline needs already in place, then batch-load every record. Uses parallel agents because Airtable enforces a one-record-per-create-call limit  -  serial loading of 500 records would take 8-10 minutes; 4 parallel agents cut that to 2-3 minutes.

## When to use

- "Load these leads into Airtable: <file path>".
- "Create a new Airtable table for this scrape".
- Phase 2 of either LinkedIn pipeline (called by the orchestrator).
- You have a JSON list of leads from any source and want them in Airtable with the standard pipeline schema.

## Connections I need

- **Airtable** (database) - Required. I list bases, create the table, and load records via Airtable's REST API through Composio.

If Airtable isn't connected I stop and ask you to connect it from the Integrations tab.

## Information I need

- **The source file with leads** - Required. JSON array of objects. At minimum each row needs `profileUrl` and `fullName`. Optional: `headline`, `commentText`, `reactionCount`, `location`, `connectionsCount`, `experience`, `education`, `skills`. If missing I ask: "Where's the lead list? Pass me a path to a JSON file or paste the array."
- **The Airtable base** - Required. If you have only one base, I use it. If you have multiple, I list them and ask which one. If missing I ask: "Which Airtable base should I create the new table in?"
- **A table name** - Optional. Defaults to `LinkedIn {sourceType} - {author} - {YYYY-MM-DD}` where `sourceType` is "Commenters" or "Reactors". Override per call if you have a naming convention.

## The table schema

I create the table with these fields. Field types match Airtable's REST API conventions.

**Lead identification (always populated by the load):**
- `Full Name` (singleLineText)
- `Profile URL` (url)
- `Headline` (singleLineText)
- `Source Type` (singleSelect: "comment", "reaction")
- `Source Post URL` (url)
- `Source Author` (singleLineText)
- `Scraped At` (dateTime)

**Comment-source extras (populated only for comment scrapes):**
- `Comment Text` (multilineText)
- `Reaction Count` (number)

**Reaction-source extras (populated only for reaction scrapes):**
- `Location` (singleLineText)
- `Connections Count` (number)
- `Reaction Type` (singleSelect: "LIKE", "CELEBRATE", "LOVE", "INSIGHTFUL", "FUNNY", "SUPPORT")
- `Top Role` (singleLineText)  -  most recent `experience[0]`, formatted as "{role} at {company}"
- `Top School` (singleLineText)  -  most recent `education[0].school`
- `Top Skills` (multipleSelects)  -  first 5 of `skills`

**Enrichment (populated by `apollo-enrichment`):**
- `Email` (email)
- `Email Confidence` (singleSelect: "verified", "guessed", "no-match")
- `Company` (singleLineText)
- `Title` (singleLineText)
- `Apollo Contact URL` (url)
- `Enriched At` (dateTime)

**Outreach status (populated by `instantly-campaign`):**
- `Loaded To Campaign` (singleLineText)  -  Instantly campaign name
- `Loaded At` (dateTime)
- `Reply Status` (singleSelect: "no-reply", "interested", "not-now", "not-relevant", "unsubscribed", "bounced")  -  populated manually by you, not by me

## Steps

1. **List bases.** Call Airtable's "list bases" via Composio. If only one, use it. If many and the caller hasn't named one, ask the user which.

2. **Create the table.** POST a new table to the chosen base with the schema above. The schema differs slightly based on the source type  -  if every row in the source file has `commentText`, treat as comment source; if every row has `experience`, treat as reaction source; otherwise treat as comment source (smaller schema, safer default). Save the new `baseId` and `tableId` for the load step.

3. **Batch into chunks.** Split the source list into chunks of `ceil(N / 4)`. Four chunks of roughly equal size.

4. **Parallel load.** Spawn 4 parallel agents, one per chunk. Each agent loops over its chunk and calls Airtable's `create record` endpoint per row (Airtable enforces one record per call regardless of how the API documents it). Each agent reports its success / failure count back when done. Wait for all 4.

5. **Verify load count.** Re-fetch the count of rows in the new table. If `loaded != expected`, log the diff to `runs/{runId}/notes.md` (the missing `profileUrl`s) so you know which rows didn't make it. Continue  -  partial loads are still useful, the diff just needs to be visible.

6. **Write `airtable.md` to the run folder.** Path: `runs/{runId}/airtable.md`. Contents: link to the new table in the Airtable UI, base ID, table ID, expected vs. actual row count, list of any failed `profileUrl`s.

7. **Append to `outputs.json`.** One row: `{type: "airtable-load", title: "{tableName}", summary: "{N} records loaded into Airtable. Base {baseId}.", path: "runs/{runId}/airtable.md", status: "ready", domain: "sources"}`.

8. **Summarize to user.** One line: "Loaded {N} records into Airtable table '{tableName}'. Open in Airtable: <url>."

## Outputs

- New Airtable table at the chosen base, with the full pipeline schema.
- `runs/{runId}/airtable.md`  -  link + IDs + load diff (if any).
- `outputs.json`  -  one row, `type: "airtable-load"`.

## Common failure modes

| Failure | Why | Fix |
|---|---|---|
| Token-limit error on `list_records` | Airtable rate limits the read endpoint | Don't list records to verify count - use the table's `record_count` field instead, or page in chunks of 100 |
| Batch limit exceeded | Trying to create 10 records in one call | Airtable enforces 1 record per create call; the parallel-agent design works around this without changing the per-call shape |
| Field type mismatch on create | The source row had a value for a singleSelect that wasn't in the options list | Pre-collect the unique values from the source and add them all as singleSelect options at table-create time, before the load |
| Some rows silently dropped | Airtable rejected them for a per-field validation error | The verify-load-count step in step 5 surfaces the diff; act on the missing `profileUrl`s manually |

## What I never do

- **Hardcode the Airtable base ID.** Always discovered via Composio at runtime.
- **Use a serial load.** 500 records serially is 8-10 minutes; the 4-parallel-agent design is the standard.
- **Mutate an existing table.** Each pipeline run gets a fresh table. If you want to merge into an existing table, that's a different skill (not currently shipped).
- **Touch the `Reply Status` field.** That's owned by you (or by an Instantly → Airtable integration you set up separately). I never write it.
