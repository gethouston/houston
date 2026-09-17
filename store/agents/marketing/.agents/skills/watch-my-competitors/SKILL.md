---
name: watch-my-competitors
description: "Keep tabs on what your competitors are doing and whether any of it matters. Pick what to watch: their product moves and messaging changes, the ads they're running, or posts in your feed worth jumping on. Real threats vs noise, not a news dump."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [linkedin, twitter, reddit, instagram, googleads, metaads, firecrawl]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Watch My Competitors

One skill, three signal sources. `source` param picks probe. Positioning-grounded judgment + "never invent quotes" shared.

## Parameter: `source`

- `product`  -  blog + release notes + homepage / pricing via Firecrawl; single-competitor teardown OR N-competitor weekly digest.
- `ads`  -  Meta Ad Library + LinkedIn Ad Library + Google Ads Transparency Center via Composio scrape; extract angles, hooks, audiences, what new this week.
- `social-feed`  -  timeline / subreddit / mentions filtered for topical relevance + engagement opportunity (LinkedIn / X / Reddit / Instagram).

User name source plain English ("competitor teardown", "what ads is Ramp running", "scan my X timeline") -> infer. Ambiguous -> ask ONE question naming 3 options.

## When to use

- Explicit: "weekly competitor pulse", "teardown of {X}", "what ads is {Y} running", "scan my timeline", "Reddit signal in {subreddit}", "IG mentions".
- Implicit: after `plan-a-campaign` (paid / launch) when competitor positioning affect angles; before `write-a-post` channel=reddit to surface exact threads worth replying to.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing -> I name the category, ask you to connect it from the Integrations tab, stop.

- **Web scrape (Firecrawl)**  -  optional for `product`. If not connected I fall back to basic HTTP fetch on competitor blog / changelog / pricing / homepage, rougher but workable on static pages.
- **Ad libraries (Meta Ads, LinkedIn Ads, Google Ads)**  -  pull live competitor ad creative. Required for `ads`  -  no useful fallback, the libraries gate access.
- **Social platforms (LinkedIn, X, Reddit, Instagram)**  -  read your timeline or named subreddit. Required for `social-feed`, pick the platform you actually live on  -  no fallback, OAuth-gated.

If `ads` or `social-feed` requires a connection that isn't there I stop. For `product`, the scrape is the only requirement and basic HTTP fetch keeps me going.

## Information I need

I read your marketing context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your positioning**  -  Required for every source. Why I need it: gives me your competitor list and the differentiators I judge threats against. If missing I ask: "Want me to draft your positioning first? It's one skill, takes about five minutes."
- **Your ideal customer**  -  Required. Why I need it: filters which competitor signals actually matter for your buyer. If missing I ask: "Who's the customer you're trying to win? A paragraph is fine, or point me at your CRM."
- **Your social platforms and topics**  -  Required for `social-feed`. Why I need it: tells me which feed to scan and what counts as relevant. If missing I ask: "Which platforms do you post on, and what topics do you want me to track in your feed?"

## Steps
<!-- houston-workflow:v1 -->

1. **Read ledger + positioning.** Extract named competitor list + our differentiators + top 2-3 ideal customer objections. Gather missing required fields (ONE question each).
2. **Determine mode + target list.**
   - `product`: user named one -> teardown; "weekly pulse" or multiple -> digest (default top 3 from positioning).
   - `ads`: user named one -> that competitor; else top 3 from positioning. Check prior `competitor-briefs/` for deltas.
   - `social-feed`: parse user request  -  "my timeline" -> X, "my LinkedIn feed" -> LinkedIn, "{subreddit}" -> Reddit, "IG mentions" -> Instagram. Default primary platform from `domains.social.platforms`. Window: last 24-48h capped ~50 posts unless user specifies.
3. **Discover tools via Composio.** Run appropriate `composio search` calls:
   - `product` -> `web-scrape` (homepage / blog / changelog), `web-search` (news / funding), optionally `seo-intel`, optionally `ad-intel`.
   - `ads` -> ad-library / ad-intelligence tools (Meta Ad Library, LinkedIn Ad Library, Google Ads Transparency) + `web-scrape` fallback.
   - `social-feed` -> platform's read-feed / top-posts / mentions tool.
   Needed category not connected -> note in brief ("no ad-intel connection  -  ad activity: UNKNOWN") and continue, or (social-feed where source IS platform) name category to link and stop.
4. **Branch on source.**
   - `product` (last 7 days digest, last 30 teardown): per competitor gather **site / messaging** (homepage hero, changed copy), **product / changelog** (new features, pricing shifts), **content** (recent blog, podcasts, newsletters), **SEO** (ranking gains / losses on positioning-relevant keywords, if connected), **social / news** (funding, hires, launches). Compare against our positioning  -  each signal ask: threaten OUR differentiators? Open gap WE attack? Cite verbatim side-by-side (competitor vs our positioning-doc copy).
   - `ads`: each ad pulled extract platform + format, headline + primary text (verbatim), CTA, inferred audience, inferred angle (pain / status / urgency / social-proof / feature-led / price-led), estimated run duration. Synthesize: dominant angle(s), pains named (verbatim), differentiators claimed, creative format mix, deltas vs prior pulls.
   - `social-feed`: each post judge **Topical relevance** (touch `domains.social.topics`? high / medium / none), **Engagement opportunity** (add real value  -  substantive disagree, sharp question, specific experience? or like enough?), **Risk** (flag political / personal / off-brand). Keep 5-10 high-value posts. Draft suggested 1-3 sentence replies for top 3-5 in voice from ledger.
5. **Opportunity callouts.** Each source, surface concrete moves:
   - `product` -> recommended moves tagged with in-agent skill that executes them (e.g. `[write-a-post:blog]`, `[plan-a-campaign:paid]`, `[write-my-page-copy:landing]`).
   - `ads` -> angles they missing that our positioning owns, claims to counter on our landing page, creative patterns to test (hand to `plan-a-campaign:paid` or content generation).
   - `social-feed` -> "also worth a like" shortlist + top-1 post to reply to first.
6. **Write** atomically to:
   - `product` teardown: `competitor-briefs/product-{competitor-slug}-{YYYY-MM-DD}.md`
   - `product` digest: `competitor-briefs/product-weekly-{YYYY-MM-DD}.md`
   - `ads`: `competitor-briefs/ads-{competitor-slug}-{YYYY-MM-DD}.md`
   - `social-feed`: `competitor-briefs/social-feed-{platform}-{YYYY-MM-DD}.md`
   Every claim ties to URL + timestamp or marked UNKNOWN.
7. **Append to `outputs.json`**  -  read-merge-write atomically:
   `{ id (uuid v4), type: "competitor-brief", title, summary, path,
   status: "draft", createdAt, updatedAt }`.
8. **Summarize to user.** One paragraph:
   - `product` -> biggest threat + biggest opportunity + 1 move this week + path.
   - `ads` -> dominant angle they pushing + one opportunity for us + path.
   - `social-feed` -> N high-signal posts + top one + path.

## What I never do

- Invent ad headlines, competitor quotes, post counts, engagement stats. Every verbatim claim ties to real pull. Tool returned nothing -> say so.
- Reply / post / DM on your behalf. Drafts only.
- Hardcode tool names. Composio discovery at runtime only.

## Outputs

- `competitor-briefs/{source}-{slug-or-date}.md`
- Appends entry to `outputs.json` with type `competitor-brief`.
