---
name: check-my-marketing
description: "Get a read on how your marketing is actually doing. Pick what you need: a funnel readout that flags the biggest leak with experiments to run, a content gap analysis vs a competitor, or a weekly rollup of everything I shipped and what's missing. Numbers and next moves, not a dashboard."
version: 1
category: Marketing
featured: yes
image: megaphone
integrations: [linkedin, firecrawl, semrush]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Check My Marketing

One skill, three subjects. `subject` param pick lens. "Never invent numbers" shared across all.

## Parameter: `subject`

- `funnel`  -  stage-by-stage conversion from PostHog / GA4 / Mixpanel (or paste). Biggest drop-off + 2-3 experiments ranked by expected lift x effort.
- `content-gap`  -  crawl competitor via Firecrawl / Semrush, compare vs our content, rank gaps by volume x fit / difficulty, first-draft brief per top gap.
- `marketing-health`  -  weekly rollup of what THIS agent shipped (blog / campaigns / emails / social / page rewrites) by grouping `outputs.json` by type. Flag gaps ("no drip in 3 weeks"), recommend next moves per domain.

User name subject in plain English ("weekly funnel review", "where are we leaking", "what are we missing vs Ramp", "Monday marketing review") -> infer. Ambiguous -> ask ONE question naming 3 options.

## When to use

- Explicit: "weekly funnel review", "analyze the signup funnel", "content gap vs {competitor}", "where can we out-rank {X}", "Monday marketing review", "weekly readout".
- Implicit: typically scheduled (weekly / Monday) by routine.
- Cadence: `funnel` weekly, `content-gap` monthly max per competitor, `marketing-health` weekly.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing -> I name the category, ask you to connect it from the Integrations tab, stop.

- **Analytics (PostHog, GA4, or Mixpanel)**  -  source of stage-by-stage funnel counts. Required for `funnel`  -  no useful fallback, the data lives in your analytics tool.
- **Web scrape (Firecrawl)**  -  optional for `content-gap`. If not connected I fall back to basic HTTP fetch on competitor pages, rougher but workable on static sites.
- **SEO (Semrush or Ahrefs)**  -  size keyword volumes and ranking gaps. Required for `content-gap`  -  no fallback, that data is proprietary.

If analytics is required for `funnel` and not connected I stop. For `content-gap`, if SEO data is missing I stop too. The scrape category is the only one where I keep going on a fallback.

## Information I need

I read your marketing context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your positioning**  -  Required for `content-gap` and `marketing-health`, helpful for `funnel`. Why I need it: differentiates threats from noise and frames the readout. If missing I ask: "Want me to draft your positioning first? It's one skill, takes about five minutes."
- **Your analytics tool and primary conversion**  -  Required for `funnel`. Why I need it: I won't make up funnel numbers. If missing I ask: "Connect PostHog, GA4, or Mixpanel from the Integrations tab so I can pull your funnel, or paste stage-by-stage counts for the last seven days."
- **Your website domain**  -  Required for `content-gap` (the site I compare against the competitor). If missing I ask: "What's your website? Paste the URL."

## Steps
<!-- houston-workflow:v1 -->

1. **Read ledger + positioning.** Gather missing required fields (ONE question each, best-modality first).
2. **Branch on subject.**
   - `funnel`: source numbers in priority order:
     - a) Connected analytics via Composio  -  run `composio search` for provider in `domains.paid.analytics`, execute funnel / query tool by slug, pull stage counts last 7 days + prior 7 days.
     - b) Else ask user to paste `stage | count | period`.
     - c) Neither -> stop. No made-up numbers.
     Define stages: use ledger-captured stages if present; else propose 4-6 based on primary conversion (e.g. signup: `visit -> signup_started -> signup_completed -> activation_event -> retained_day_7`), confirm on first run, write to ledger. Compute per-stage rates + WoW deltas + absolute drop counts. Name **biggest leak** (highest absolute drop AND lowest conversion vs reasonable benchmarks  -  B2B SaaS: visit->signup 2-5%, signup->activation 30-60%, activation->day-7 retention 40-70%). Recommend 2-3 experiments ranked by (impact x effort): stage targeted + hypothesis (hand to dedicated A/B spec skill) + effort (this-week / this-month / larger) + expected directional lift tied to real mechanism (no magic numbers).
   - `content-gap`: resolve competitor domain(s)  -  user-named or top 1-3 from positioning. Run `composio search web-scrape` / `composio search seo` to crawl competitor: ranking keywords, top pages by estimated traffic, topic clusters owned. Crawl OUR content via connected CMS or `domains.seo.domain` posts list. Per competitor-owned topic / keyword record: do we cover it (yes / partial / no), search volume (from keyword tool), estimated difficulty (relative), positioning fit (yes / neutral / off-brand). Rank by `(volume x fit) / difficulty`. Surface top 10 with recommended next-action (new post -> hand to `write-a-post` channel=blog / refresh existing / skip + why).
   - `marketing-health`: read THIS agent's `outputs.json` (single file  -  one agent now, not five). Filter to review window (default last 7 days by `createdAt` / `updatedAt`; honor user's "last 2 weeks", "since launch"). Group by `type`  -  blog-post, linkedin-post, x-thread, newsletter, community-reply, page-copy, audit, campaign, competitor-brief, analysis. Per group compute: count, notable shipped (top 3 by recency with title + path + status), drafts still open (status = "draft") stale >7 days, gaps  -  what's MISSING that solo-founder stack expects (no blog this week, no campaign brief this week, no newsletter, no welcome sequence drafted, social frequency below plan). Look for cross-cutting patterns: launch drift (open launch campaign with dependent pieces not shipped), unactioned competitor signals, positioning drift from recent analyses.
3. **Draft analysis** (markdown, ~400-700 words for health / funnel, longer for content-gap):
   - `funnel` -> top-line conversion + funnel diagram (simple text) + biggest leak with number + experiments ranked + status (ready, not draft  -  factual rollup).
   - `content-gap` -> Executive summary + Top 10 opportunities table + topic-by-topic detail + skip list with reasons.
   - `marketing-health` -> Window + TL;DR (3-5 bullets) + What shipped by domain + Gaps (severity-ranked) + Cross-cutting issues + 3-5 recommended next moves tagged with in-agent skill that executes them (e.g. `[write-a-post:newsletter]`, `[plan-a-campaign:lifecycle-drip]`, `[audit-a-surface:landing-page]`) + What to flip to ready (stale drafts awaiting sign-off). Status `ready`.
4. **Write** atomically to `analyses/{subject}-{YYYY-MM-DD}.md` (`*.tmp` -> rename). Content-gap uses `analyses/content-gap-{competitor-slug}-{YYYY-MM-DD}.md`.
5. **Append to `outputs.json`**  -  read-merge-write atomically: `{ id (uuid v4), type: "analysis", title, summary, path, status: "ready", createdAt, updatedAt }`.
6. **Summarize to user.** One paragraph:
   - `funnel` -> top-line conversion + biggest leak with number + one experiment this week + path.
   - `content-gap` -> top 3 opportunities with one-line recommended post title each + path.
   - `marketing-health` -> "{N} outputs this week across {domains}. Biggest gap: {gap}. Biggest next move: {move}. Full review: {path}."

## What I never do

- Invent funnel numbers, competitor traffic estimates, engagement stats. Data unreachable -> say so and stop (funnel) or mark TBD (content-gap).
- Inflate gaps where coverage fine.
- Promise lift percentage  -  experiments come with MDE + mechanism caveats.
- Hardcode tool names. Composio discovery at runtime only.

## Outputs

- `analyses/{subject}-{YYYY-MM-DD}.md`
- Append entry to `outputs.json` with type `analysis`.
