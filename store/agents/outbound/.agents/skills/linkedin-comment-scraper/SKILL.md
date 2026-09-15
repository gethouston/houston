---
name: linkedin-comment-scraper
description: Scrape every commenter on a LinkedIn post via Apify. I pull names, headlines, profile URLs, comment text, and reaction counts; dedupe by profile URL; drop null profiles; save the list to a per-run file. Phase 1 of the comment-to-outreach pipeline, but also runnable standalone if you only need the list.
version: 1
tags: []
last_used: 2026-06-06
category: Outbound
integrations: [apify, linkedin]
image: chains
---

# LinkedIn Comment Scraper

Pull every commenter from a LinkedIn post into a clean, deduped list. Phase 1 of the comment-to-outreach pipeline, but you can run it standalone if you only need the list (e.g. as input to a different downstream tool).

## When to use

- "Scrape commenters from this LinkedIn post: <URL>".
- "Pull a list of who commented on this post".
- You want a clean, deduped commenter list for any downstream use - not necessarily cold outreach.

## When NOT to use

- You want to **react** to a post (not comment)  -  use `linkedin-reaction-scraper`.
- You want the full end-to-end pipeline through to Instantly  -  use `linkedin-comment-to-outreach`.

## Connections I need

- **Apify** (scraping) - Required. I use the `harvestapi/linkedin-post-comments` actor.

If Apify isn't connected I stop and ask you to connect it from the Integrations tab.

## Information I need

- **The LinkedIn post URL** - Required. If missing I ask: "Which LinkedIn post should I scrape?"
- **A target item count** - Optional. Defaults to `defaultMaxItems` from your outbound context (500). Override per call if you only want a quick test pull.

## Steps

1. **Validate URL.** Confirm the URL is a LinkedIn post (`linkedin.com/posts/...` or `linkedin.com/feed/update/...`). Reject profile URLs, article URLs, company URLs. If the input is a short link or a redirect, follow it once to resolve the canonical post URL before scraping.

2. **Test pull.** First call to the actor with `maxItems: 20` to confirm the post is reachable and the actor returns the expected shape. If the test pull returns 0 items, stop and surface why (post deleted, comments disabled, geo-blocked, actor cold-start).

3. **Full pull.** Call the actor with `maxItems: {target}` (default 500). Wait for the run to finish. Apify typically takes 2-5 minutes for the full pull.

4. **Dedupe.** Group raw items by `profileUrl`. For duplicates within one scrape (same person commented multiple times), keep the row with the longest `comment` text. Drop rows where `profileUrl` is null or where `fullName` is null  -  these are scrape misses, not real leads.

5. **Save to file.** Write to `runs/{runId}/scrape.json` if called from an orchestrator (the orchestrator passes the `runId`). If called standalone, write to `runs/{YYYY-MM-DD}-{post-slug}/scrape.json`. Schema per row:

   ```jsonc
   {
     "profileUrl": "https://www.linkedin.com/in/janedoe",
     "fullName": "Jane Doe",
     "headline": "VP Operations at Northwind",
     "commentText": "Same pattern at every 200+ person company we look at.",
     "reactionCount": 14,
     "scrapedAt": "<ISO>"
   }
   ```

6. **Update `leads.json`.** For each surviving row, append to `leads.json` if the `profileUrl` is new. Existing rows stay  -  do not overwrite their `email` / `company` / `title` since those may have been set by a prior enrichment run. Set `source: "linkedin-comment"`, `sourcePostUrl`, `sourceAuthor`, `scrapedAt`.

7. **Append to `outputs.json`.** One row: `{type: "scrape", title: "LinkedIn commenters - {author} post", summary: "{N} unique commenters scraped, deduped by profile URL.", path: "runs/{runId}/scrape.json", status: "ready", domain: "sources"}`.

8. **Summarize to user.** One line: "Scraped {N} unique commenters from {author}'s post. Saved to your runs folder."

## Outputs

- `runs/{runId}/scrape.json`  -  deduped commenter list.
- `leads.json`  -  new commenters appended (existing rows untouched).
- `outputs.json`  -  one row, `type: "scrape"`, `domain: "sources"`.

## Common failure modes

| Failure | Why | Fix |
|---|---|---|
| Only 20 results returned on the full pull | I forgot to bump `maxItems` past the test value | Re-run with `maxItems: 500` (or your context default) |
| Actor returns 0 items | Post deleted, comments disabled, geo-blocked | Verify the URL in a browser, then try a different post if the original is gone |
| All `profileUrl` null | LinkedIn served the actor a logged-out view of the post | Wait 5-10 minutes (actor warm-up) and retry |
| Same person appears 5 times in raw output | They commented 5 times | Dedupe step keeps only the longest comment per profile |

## What I never do

- **Hardcode the Apify actor ID.** I look it up via Composio at runtime so a different actor or a forked version works without a code change.
- **Cap dedupe by `fullName`.** Different people share names; `profileUrl` is the only safe key.
- **Persist comment text to `leads.json`.** That goes in the per-run scrape file only, not the cross-run lead index. Keeps the index small and stable.
