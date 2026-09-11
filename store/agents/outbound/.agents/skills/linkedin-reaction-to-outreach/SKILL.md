---
name: linkedin-reaction-to-outreach
description: Same end-to-end pipeline as the comment version, but for people who reacted to a LinkedIn post. 5-10x more leads than commenters and the scrape returns full LinkedIn profiles (experience, education, skills, certifications, location, connections count) in one shot. Best for broader-audience plays where you want volume + rich personalization data. Always paused for your review - I never auto-launch.
version: 1
tags: []
last_used: 2026-06-06
category: Outbound
featured: yes
integrations: [apify, airtable, apollo, instantly, linkedin]
image: envelope-with-arrow
---

# LinkedIn Reaction to Outreach

End-to-end orchestrator: LinkedIn post URL in, paused Instantly campaign out. Same five-phase chain as `linkedin-comment-to-outreach`, but I scrape **reactors** instead of commenters.

Why reactors? Two reasons:

1. **Volume**  -  reactors typically outnumber commenters 5-10x. A post with 30 commenters often has 200-500 reactors.
2. **Richer profiles**  -  the reaction scrape returns full LinkedIn profiles per person (experience history, education, skills, certifications, location, connections count) directly in one Apify call. The commenter scrape only returns surface fields. This makes the personalization ceiling much higher.

Trade-off: reacting is a lower-effort signal than commenting. You're trading per-lead intent for volume + data depth.

## When to use

- "Run the LinkedIn reaction pipeline on this post: <URL>".
- "Scrape and email everyone who reacted to this post".
- A post is hitting your ideal customer profile broadly and you want maximum coverage.
- You want full LinkedIn profile data attached to each lead (for personalization in the email body, not just the subject).
- Niche-audience outreach: "CPAs who reacted to a tax planning post", "founders who reacted to a fundraising thread".

## When NOT to use

- You only want **commenters** (higher per-lead intent)  -  use `linkedin-comment-to-outreach`.
- Just need the reactor list, no outreach  -  use `linkedin-reaction-scraper` directly.
- Just need to enrich an existing list  -  use `apollo-enrichment` directly.
- Already have a verified list and copy ready  -  use `instantly-campaign` directly.

## Connections I need

I run external work through Composio. Before this skill runs I check that every category below is linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Apify** (scraping) - for the LinkedIn reaction actor (with `profileScraperMode: "main"`). Required.
- **Airtable** (database) - for the lead-tracking table. Required.
- **Apollo** (enrichment) - for verified emails + company / title / location. Required.
- **Instantly** (sending platform) - for campaign creation and lead loading. Required.

If any of the four are missing I stop on the first missing one and ask you to connect it. The pipeline does not partially run.

## Information I need

I read your outbound context first. For every required field that's missing I ask ONE plain-language question and wait.

- **The LinkedIn post URL** - Required. Why: input to phase 1.
- **An Airtable base** - Required. Why: phase 2 creates a new table inside one of your bases.
- **Your sender first name + product one-liner + at least one social proof point with real numbers** - Required for phase 4. Asked then, not now.
- **Instantly sending accounts** - Optional. Defaults to "all connected".

## The pipeline

```
LinkedIn Post URL
       |
       v
[1. linkedin-reaction-scraper]  Apify scrape with profileScraperMode=main, dedupe by profile URL
       |
       v
[2. airtable-lead-loader]       Create table with reaction-specific schema, batch load
       |
       v
[3. apollo-enrichment]          Bulk match emails (batches of 10), update Airtable, create Apollo contacts
       |
       v
[4. cold-email-sequence]        Co-write 3 emails with you, leveraging the rich profile data
       |
       v
[5. instantly-campaign]         Create campaign, sanitize bodies, load leads, attach accounts - PAUSED
       |
       v
Paused campaign ready for your review
```

## Steps

1. **Validate inputs.** Check the URL is a LinkedIn post, confirm the four Composio connections, read `config/context-ledger.json`. Mint a `runId` of the form `{YYYY-MM-DD}-{post-slug}-reactions` and create `runs/{runId}/notes.md`.

2. **Phase 1 - Scrape reactors.** Call `linkedin-reaction-scraper` with the post URL and `profileScraperMode: "main"` so the result includes full profiles. Result lands at `runs/{runId}/scrape.json`. Append summary to `runs/{runId}/notes.md`.

   **Checkpoint.** Tell the user: "Scraped {N} unique reactors from {author}'s post (with full profiles). Moving on to Airtable."

3. **Phase 2 - Load to Airtable.** Call `airtable-lead-loader` with `runs/{runId}/scrape.json` and the chosen base ID. Use the **reaction schema** which has extra columns for `experienceTopRole`, `educationTopSchool`, `topSkills`, `connectionsCount`. The table name is `LinkedIn Reactors - {author} - {YYYY-MM-DD}`. Append summary to `runs/{runId}/notes.md` with the table ID and load count.

   **Checkpoint.** Tell the user: "Loaded {N} records into Airtable with full profile data. Starting Apollo enrichment."

4. **Phase 3 - Enrich with Apollo.** Call `apollo-enrichment` with the Airtable base + table ID. Same as the comment pipeline: bulk match in batches of 10, update Airtable rows, create Apollo contacts under label `LinkedIn Reactions - {author} Post`. Save the verified-email rows to `runs/{runId}/contacts.json`. Append match-rate summary.

   **Checkpoint.** Tell the user: "Found emails for {M} of {N} reactors ({M/N}% match rate). {M} contacts ready for outreach. Moving on to the email sequence."

5. **Phase 4 - Co-write the sequence.** Call `cold-email-sequence` with a flag indicating that profile data is available. The sequence writer uses `experienceTopRole` + `educationTopSchool` + `topSkills` to suggest body-level personalization placeholders (e.g. "saw you're heads-down on {topSkill}"), but the James Shields rules still apply: subject is the only personalization that's guaranteed real, body uses `{{firstName}}` and at most ONE template field per email. Save to `sequences/{runId}-sequence.md`.

   **Checkpoint.** Tell the user: "Sequence locked. Loading into Instantly."

6. **Phase 5 - Create the Instantly campaign.** Call `instantly-campaign` with `sequences/{runId}-sequence.md` and `runs/{runId}/contacts.json`. The campaign name is `LinkedIn Reactions - {author} - {short topic}`. Always paused. Append the Instantly campaign ID and lead-load summary. Append a row to `campaigns.json` with `status: "paused"`.

7. **Final summary.** One short block to the user:
   - Campaign name + status (paused).
   - Lead count loaded.
   - Sending accounts attached.
   - Schedule (Mon-Fri, 8-5 in your default timezone).
   - "Review in Instantly. Activate when you're ready - I won't do it for you."

## Outputs

- `runs/{runId}/scrape.json`  -  deduped reactor list with full profiles.
- `runs/{runId}/contacts.json`  -  Apollo-enriched contacts with verified emails.
- `runs/{runId}/notes.md`  -  per-run journal.
- `sequences/{runId}-sequence.md`  -  locked 3-email sequence.
- New Airtable table `LinkedIn Reactors - {author} - {date}` populated with the reaction schema.
- New Apollo contact label `LinkedIn Reactions - {author} Post`.
- New Instantly campaign (paused).
- `outputs.json`, `leads.json`, `campaigns.json`  -  index rows.

## What I never do

- **Launch the campaign.** Always paused.
- **Skip the per-email lock in phase 4.** Each email approved before the next.
- **Over-personalize the body using profile fields that are old or thin.** Profile experience can be years stale; treat it as a hint, not ground truth. If `experienceTopRole` is more than 3 years old or has the placeholder "Open to work", I drop it from the personalization pool for that lead.
- **Push leads without a verified email into Instantly.**
- **Hardcode Apify actor IDs, Airtable base IDs, Apollo labels, Instantly campaign IDs.**
