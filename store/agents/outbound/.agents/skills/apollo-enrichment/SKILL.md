---
name: apollo-enrichment
description: Find verified emails for a list of leads via Apollo's bulk match (batches of 10), update the Airtable rows with email + company + title + location, and create Apollo contacts under a named label so the leads show up in your Apollo CRM workflows. Phase 3 of both pipelines, runnable standalone if you have an Airtable table populated by the loader.
version: 1
tags: []
last_used: 2026-06-06
category: Outbound
integrations: [airtable, apollo]
image: magnifying-glass-tilted-left
---

# Apollo Enrichment

Take a list of leads in an Airtable table and find verified emails for as many as possible via Apollo's bulk match endpoint. Updates the Airtable rows in place with email + company + title + location, and creates Apollo contacts under a named label so the leads land in your Apollo CRM workflows. Match rate is highly audience-dependent  -  expect 50-70% on US founder / operator audiences, lower on consumer or non-US audiences.

## When to use

- "Enrich these leads with Apollo: <Airtable table>".
- "Find emails for the rows in this table".
- Phase 3 of either LinkedIn pipeline (called by the orchestrator).
- You have an Airtable table populated with `Profile URL`s and want emails attached.

## When NOT to use

- The leads aren't in Airtable yet  -  load them first with `airtable-lead-loader`.
- You only want to **read** Apollo data, not modify Airtable  -  this skill writes back to Airtable as part of its contract; if you only need a one-shot Apollo lookup, do it manually.

## Connections I need

- **Airtable** (database) - Required. I read the rows, then write the enrichment fields back.
- **Apollo** (enrichment) - Required. I use the `apollo_people_bulk_match` endpoint and the `apollo_contacts_create` endpoint via Composio.

If either is missing I stop and ask you to connect it.

## Information I need

- **The Airtable base ID + table ID** - Required. If called from an orchestrator, both are passed in. If called standalone, I list bases and tables and ask which one if there's any ambiguity.
- **An Apollo contact label** - Optional. Defaults to `LinkedIn {sourceType} - {sourceAuthor} Post`, derived from the table's `Source Type` and `Source Author` fields (every row in a given table has the same source). Override per call.

## Steps

1. **Pull all records.** Page through the Airtable table 100 records at a time until done. Collect rows where `Email` is empty (don't re-enrich rows that already have an email). Stash the source `Profile URL`, `Full Name`, `Headline`, and Airtable `record_id` for each.

2. **Batch into groups of 10.** Apollo's `apollo_people_bulk_match` accepts up to 10 lookups per call. Split the not-yet-enriched rows into chunks of 10.

3. **Bulk match in parallel.** Spawn parallel agents (4 at a time, same as the loader) and call `apollo_people_bulk_match` with each chunk. Per row in the request, send `linkedin_url: profileUrl` as the primary key, plus `name: fullName` as a fallback for Apollo's matcher. Wait for all calls to complete.

4. **Map results back to Airtable rows.** Apollo returns an array per call in the same order as the request. Per result:
   - **Verified email returned**  -  set `Email`, `Email Confidence: "verified"`, `Company`, `Title`, `Location`, `Apollo Contact URL`, `Enriched At`.
   - **Guessed email returned** (Apollo flags lower-confidence matches)  -  same fields, but `Email Confidence: "guessed"`. The downstream `instantly-campaign` skill drops these by default.
   - **No match**  -  set `Email Confidence: "no-match"` only. Leave `Email`, `Company`, `Title` empty.

5. **Update Airtable in batches.** Update 10 records per `update records` call (Airtable's actual batch limit on update, unlike create). Spawn parallel update agents.

6. **Create Apollo contacts under the label.** For every row that came back with a verified or guessed email, call `apollo_contacts_create` with the contact's Apollo person ID and the chosen label. Apollo deduplicates contacts by email, so re-running this step on the same data is idempotent.

7. **Re-fetch enriched rows.** Page the table again, collect rows where `Email Confidence: "verified"`. Save them to `runs/{runId}/contacts.json` in the shape `instantly-campaign` expects:

   ```jsonc
   {
     "firstName": "Jane",
     "fullName": "Jane Doe",
     "email": "jane@northwind.example",
     "company": "Northwind",
     "title": "VP Operations",
     "linkedinUrl": "https://www.linkedin.com/in/janedoe",
     "personalizationFields": {
       "topRole": "VP Operations at Northwind",
       "topSchool": "Stanford",
       "topSkills": ["Operations", "Process Design"]
     }
   }
   ```

   `personalizationFields` only populated for reaction-source tables (where the loader wrote `Top Role`, `Top School`, `Top Skills`). For comment-source tables this object is empty.

8. **Update `leads.json`.** For every row enriched, find the matching `profileUrl` in `leads.json` and set `email`, `emailConfidence`, `company`, `title`, `location`, `enrichedAt`. Read-merge-write atomically.

9. **Append to `outputs.json`.** One row: `{type: "enrichment", title: "Apollo enrichment - {tableName}", summary: "Matched {M} of {N} ({M/N}% match rate). {V} verified emails ready for outreach.", path: "runs/{runId}/contacts.json", status: "ready", domain: "enrichment"}`.

10. **Summarize to user.** One block:
    - Total rows processed.
    - Verified emails found (count + percentage).
    - Guessed emails found (count + percentage).
    - No-match count.
    - "Verified emails saved for the next phase. Guessed emails stay in Airtable for your review."

## Outputs

- Airtable rows updated with email + company + title + location + Apollo URL + confidence.
- New Apollo contacts under the label `LinkedIn {sourceType} - {sourceAuthor} Post`.
- `runs/{runId}/contacts.json`  -  verified-email contacts ready for `instantly-campaign`.
- `leads.json`  -  enrichment fields backfilled on matching `profileUrl`s.
- `outputs.json`  -  one row, `type: "enrichment"`, `domain: "enrichment"`.

## Common failure modes

| Failure | Why | Fix |
|---|---|---|
| Match rate under 40% | Audience is consumer-heavy, non-US, or junior-titled (Apollo's database is enterprise-skewed) | Normal for some audiences; proceed with what you have |
| Cached data missing emails on the re-fetch | Airtable read returned a stale cache | Wait 30 seconds and re-page; if still missing, the update writes silently failed - check for rate-limit errors in the run notes |
| Apollo rate-limit on bulk match | Too many parallel agents on a small Apollo plan | Drop to 2 parallel agents instead of 4 |
| Apollo returns a 422 on `linkedin_url` | The URL format doesn't match what Apollo expects (trailing slash, `/in/` vs `/pub/`) | Normalize to `https://www.linkedin.com/in/<slug>` before sending; strip trailing slashes |

## What I never do

- **Re-enrich rows that already have an email.** I check `Email` is empty before including a row in the bulk-match batches. Saves Apollo credits and avoids overwriting good data.
- **Push guessed emails into the Instantly campaign.** Guessed emails stay in Airtable for your review. Only verified emails make it to `runs/{runId}/contacts.json`.
- **Send emails directly through Apollo.** Apollo's send endpoints exist, but cold campaigns belong in a dedicated sender (Instantly) for deliverability tracking.
- **Hardcode the Apollo label format or the bulk-match endpoint name.** All discovered via Composio at runtime.
