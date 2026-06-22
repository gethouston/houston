---
name: linkedin-comment-to-outreach
description: Turn a single LinkedIn post URL into a paused cold email campaign in Instantly. I scrape every commenter, store them in Airtable, find verified emails through Apollo, co-write a 3-email sequence with you, then load it all into Instantly. End to end takes 30-60 minutes, most of it in the email copy. Always paused for your review - I never auto-launch. Use for higher-intent, lower-volume audiences (commenting takes effort).
version: 1
tags: []
last_used: 2026-06-06
category: Outbound
featured: yes
integrations: [apify, airtable, apollo, instantly, linkedin]
image: envelope-with-arrow
---

# LinkedIn Comment to Outreach

End-to-end orchestrator: LinkedIn post URL in, paused Instantly campaign out. I chain the five sub-skills with a checkpoint between each phase so you stay in control while the heavy lifting happens automatically.

Use this for **commenters** (higher intent, lower volume). For reactors (5-10x more leads, full LinkedIn profiles attached), use `linkedin-reaction-to-outreach` instead.

## When to use

- "Run the LinkedIn pipeline on this post: <URL>".
- "Scrape and email these commenters".
- "Outreach from this LinkedIn post".
- A speaker / competitor / thought-leader posted something that hits your ideal customer profile dead center, and you want to reach every qualified commenter in one motion.

## When NOT to use

- Targeting people who **reacted** to a post  -  use `linkedin-reaction-to-outreach`. Reactors are 5-10x more numerous and come with richer profile data.
- Just need the commenter list, no outreach  -  use `linkedin-comment-scraper` directly.
- Just need to enrich an existing list  -  use `apollo-enrichment` directly.
- Just need cold email copy without a lead source  -  use `cold-email-sequence` directly.
- Already have a verified list and copy ready  -  use `instantly-campaign` directly.

## Connections I need

I run external work through Composio. Before this skill runs I check that every category below is linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Apify** (scraping) - for the LinkedIn comment actor. Required.
- **Airtable** (database) - for the lead-tracking table. Required.
- **Apollo** (enrichment) - for verified emails + company / title / location. Required.
- **Instantly** (sending platform) - for campaign creation and lead loading. Required.

If any of the four are missing I stop on the first missing one and ask you to connect it. The pipeline does not partially run.

## Information I need

I read your outbound context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > URL > paste) and wait.

- **The LinkedIn post URL** - Required. Why: it's the input to phase 1. If missing I ask: "Which LinkedIn post should I scrape commenters from?"
- **An Airtable base** - Required. Why: phase 2 creates a new table inside one of your existing bases. If missing I ask: "Which Airtable base should I create the lead table in? I can list the ones you have."
- **Your sender first name + product one-liner + at least one social proof point with real numbers** - Required for phase 4. Why: I write the cold emails in your voice; without a real proof point with real numbers I'd be making things up, and that's a fast way to burn the campaign. If missing I ask in phase 4 (not now), so the first three phases can run in the background.
- **Instantly sending accounts** - Optional. Why: defaults to attaching every connected sending account. If you want only specific ones, tell me upfront.

## The pipeline

```
LinkedIn Post URL
       |
       v
[1. linkedin-comment-scraper]   Apify scrape, dedupe by profile URL
       |
       v
[2. airtable-lead-loader]       Create table, batch load with parallel agents
       |
       v
[3. apollo-enrichment]          Bulk match emails (batches of 10), update Airtable, create Apollo contacts
       |
       v
[4. cold-email-sequence]        Co-write 3 emails with you, one at a time, James Shields framework
       |
       v
[5. instantly-campaign]         Create campaign, sanitize bodies, load leads, attach accounts - PAUSED
       |
       v
Paused campaign ready for your review
```

## Steps

1. **Validate inputs.** Check the URL is a LinkedIn post (not a profile, not an article), confirm the four Composio connections, read `config/context-ledger.json`. Mint a `runId` of the form `{YYYY-MM-DD}-{post-slug}` and create `runs/{runId}/notes.md` for the per-run journal.

2. **Phase 1 - Scrape commenters.** Call `linkedin-comment-scraper` with the post URL. Result lands at `runs/{runId}/scrape.json`. Append summary to `runs/{runId}/notes.md`.

   **Checkpoint.** Tell the user: "Scraped {N} unique commenters from {author}'s post. Moving on to Airtable."

3. **Phase 2 - Load to Airtable.** Call `airtable-lead-loader` with `runs/{runId}/scrape.json` and the chosen base ID. The table name is `LinkedIn Commenters - {author} - {YYYY-MM-DD}`. Append summary to `runs/{runId}/notes.md` with the table ID and the load count.

   **Checkpoint.** Tell the user: "Loaded {N} records into Airtable. Starting Apollo enrichment."

4. **Phase 3 - Enrich with Apollo.** Call `apollo-enrichment` with the Airtable base + table ID. Result: Airtable rows updated with email + company + title + location, and Apollo contacts created under label `LinkedIn Comments - {author} Post`. Re-fetch the rows that came back with a verified email and save to `runs/{runId}/contacts.json`. Append match-rate summary to `runs/{runId}/notes.md`.

   **Checkpoint.** Tell the user: "Found emails for {M} of {N} commenters ({M/N}% match rate). {M} contacts ready for outreach. Moving on to the email sequence."

5. **Phase 4 - Co-write the sequence.** Call `cold-email-sequence`. This is the **interactive phase** - I work with you one email at a time, locking each before moving to the next. Save to `sequences/{runId}-sequence.md`. Append the lock summary to `runs/{runId}/notes.md`.

   **Checkpoint.** Tell the user: "Sequence locked. Loading into Instantly."

6. **Phase 5 - Create the Instantly campaign.** Call `instantly-campaign` with `sequences/{runId}-sequence.md` and `runs/{runId}/contacts.json`. The campaign name is `LinkedIn - {author} - {short topic}`. Always paused. Append the Instantly campaign ID and lead-load summary to `runs/{runId}/notes.md`. Append a row to `campaigns.json` with `status: "paused"`.

7. **Final summary.** One short block to the user:
   - Campaign name + status (paused).
   - Lead count loaded.
   - Sending accounts attached.
   - Schedule (Mon-Fri, 8-5 in your default timezone).
   - "Review in Instantly. Activate when you're ready - I won't do it for you."

## Outputs

- `runs/{runId}/scrape.json`  -  deduped commenter list from phase 1.
- `runs/{runId}/contacts.json`  -  Apollo-enriched contacts with verified emails (drives the Instantly load).
- `runs/{runId}/notes.md`  -  per-run journal with checkpoints, counts, and decisions.
- `sequences/{runId}-sequence.md`  -  locked 3-email sequence.
- New Airtable table `LinkedIn Commenters - {author} - {date}` populated with the full lead-tracking schema.
- New Apollo contact label `LinkedIn Comments - {author} Post`.
- New Instantly campaign (paused) with all leads loaded and all sending accounts attached.
- `outputs.json`  -  one row per phase artifact (scrape, airtable-load, enrichment, sequence, campaign).
- `leads.json`  -  one row per surviving lead (deduped on `profileUrl` across runs).
- `campaigns.json`  -  one row for the new paused campaign.

## What I never do

- **Launch the campaign.** Always paused at the end of phase 5. You hit Activate.
- **Skip the per-email lock in phase 4.** Each email is reviewed and approved by you before I move to the next. No batch-write of all 3.
- **Push leads without a verified email into Instantly.** Apollo "no match" rows stay in Airtable for you to decide what to do with later.
- **Resume a partially-failed run by guessing.** If phase 3 fails halfway, I stop and tell you exactly which Airtable rows are enriched and which aren't, so you can decide whether to re-run from there or start fresh.
- **Hardcode Apify actor IDs, Airtable base IDs, Apollo labels, or Instantly campaign IDs.** All discovered via Composio at runtime.
