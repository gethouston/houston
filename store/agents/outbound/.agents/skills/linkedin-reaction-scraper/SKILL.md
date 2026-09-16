---
name: linkedin-reaction-scraper
description: "Scrape every reactor on a LinkedIn post via Apify with profileScraperMode=main, so each row comes back with a full LinkedIn profile attached: experience history, education, skills, certifications, location, connections count. 5-10x more leads than the comment scrape and far richer data per lead. Phase 1 of the reaction-to-outreach pipeline, also runnable standalone."
version: 1
category: Outbound
featured: no
image: link
integrations: [apify, linkedin]
x_houston:
  created_by: houston
  skill_schema: 1
---


# LinkedIn Reaction Scraper

Pull every reactor from a LinkedIn post into a clean, deduped list  -  with a full LinkedIn profile attached to each row in one shot. Phase 1 of the reaction-to-outreach pipeline; also runnable standalone if you only need the list.

The big win over the commenter scrape: `profileScraperMode: "main"` makes the actor return the reactor's experience history, education, skills, certifications, location, and connections count directly. No second-pass enrichment for profile data needed (Apollo enrichment is still required for verified emails).

## When to use

- "Scrape reactors from this LinkedIn post: <URL>".
- "Pull a list of who reacted to this post, with their profiles".
- You want a clean, deduped reactor list with rich profile data for any downstream use.

## When NOT to use

- You want **commenters** (lower volume, higher per-lead intent)  -  use `linkedin-comment-scraper`.
- You want the full end-to-end pipeline through to Instantly  -  use `linkedin-reaction-to-outreach`.

## Connections I need

- **Apify** (scraping) - Required. I use the `harvestapi/linkedin-post-reactions` actor with `profileScraperMode: "main"`.

If Apify isn't connected I stop and ask you to connect it from the Integrations tab.

## Information I need

- **The LinkedIn post URL** - Required.
- **A target item count** - Optional. Defaults to `defaultMaxItems` from your outbound context (500). Reactor pulls regularly hit 500+ on a popular post; bump higher if you want full coverage of a viral post.

## Steps
<!-- houston-workflow:v1 -->

1. **Validate URL.** Same rules as the comment scraper: must be a LinkedIn post URL. Reject profile / article / company URLs. Resolve short links once.

2. **Test pull.** First call to the actor with `maxItems: 20` and `profileScraperMode: "main"`. Confirm shape includes `experience`, `education`, `skills`, `connectionsCount`. If those are missing, the actor wasn't given the right mode flag  -  fail loudly so you can see it.

3. **Full pull.** Call the actor with `maxItems: {target}` (default 500), `profileScraperMode: "main"`. The reaction scrape with full profiles takes longer than the comment scrape  -  expect 5-15 minutes for 500 items.

4. **Dedupe.** Group by `profileUrl`. Drop rows with null `profileUrl` or null `fullName` (scrape misses).

5. **Save to file.** Write to `runs/{runId}/scrape.json` if called from the orchestrator; otherwise `runs/{YYYY-MM-DD}-{post-slug}-reactions/scrape.json`. Schema per row:

   ```jsonc
   {
     "profileUrl": "https://www.linkedin.com/in/janedoe",
     "fullName": "Jane Doe",
     "headline": "VP Operations at Northwind",
     "location": "San Francisco, CA",
     "connectionsCount": 2840,
     "reactionType": "LIKE | CELEBRATE | LOVE | INSIGHTFUL | FUNNY | SUPPORT",
     "experience": [
       { "company": "Northwind", "role": "VP Operations", "startDate": "2024-03", "endDate": null },
       { "company": "Helios", "role": "Director of Ops", "startDate": "2021-01", "endDate": "2024-02" }
     ],
     "education": [
       { "school": "Stanford", "degree": "MBA", "endDate": "2020-06" }
     ],
     "skills": ["Operations", "Process Design", "RevOps", "Salesforce"],
     "certifications": [],
     "scrapedAt": "<ISO>"
   }
   ```

6. **Update `leads.json`.** Append new `profileUrl`s with `source: "linkedin-reaction"`, `sourcePostUrl`, `sourceAuthor`, `scrapedAt`. Existing rows stay (don't overwrite enrichment from prior runs).

7. **Append to `outputs.json`.** One row: `{type: "scrape", title: "LinkedIn reactors - {author} post", summary: "{N} unique reactors scraped with full profiles.", path: "runs/{runId}/scrape.json", status: "ready", domain: "sources"}`.

8. **Summarize to user.** One line: "Scraped {N} unique reactors from {author}'s post (with full profiles). Saved to your runs folder."

## Outputs

- `runs/{runId}/scrape.json`  -  deduped reactor list with full profiles.
- `leads.json`  -  new reactors appended.
- `outputs.json`  -  one row, `type: "scrape"`, `domain: "sources"`.

## Common failure modes

| Failure | Why | Fix |
|---|---|---|
| Only 20 results returned on the full pull | I forgot to bump `maxItems` past the test value | Re-run with `maxItems: 500` |
| `experience`, `education`, `skills` all empty | `profileScraperMode: "main"` was not set | Re-run with the flag set; without it the actor returns surface fields only |
| Run takes >30 minutes | Reactor count is 1000+ on this post | Either accept the wait or split by reaction type into multiple runs |
| All `profileUrl` null | LinkedIn served the actor a logged-out view | Wait 5-10 minutes and retry |

## What I never do

- **Hardcode the Apify actor ID.** Composio lookup at runtime.
- **Skip the `profileScraperMode: "main"` flag.** Without it the whole reason to use this scraper instead of the comment one disappears.
- **Persist `experience` / `education` / `skills` to `leads.json`.** That data goes in the per-run scrape file only, not the cross-run index. Profile data ages fast; pin it to the run that captured it.
