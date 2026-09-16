---
name: research-a-topic
description: "Get a cited, structured briefing on a topic, a company or person, or your social feed instead of scanning everything yourself. Tell me what to dig into and I pull from news and research providers, rank what matters against your priorities, and write a TL;DR plus a 'so what for us' section. Every claim ships with a source URL."
version: 1
category: Operations
featured: yes
image: clipboard
integrations: [linkedin, firecrawl, perplexityai]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Research A Topic

Three signal kinds, one skill: market news, web research, social feed monitoring. Keep founder current without scanning feeds.

## When to use

- "weekly briefing on {topic}" / "what's moving in {our category}".
- "research {company} / {person} / {product} and give me a brief".
- "summarize my X feed" / "what did my follow-list post about".
- "what's the news on {regulation / event}".

## Connections I need

I run external work through Composio. Before this skill runs I check the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Web research** (Exa, Perplexity, Firecrawl)  -  Required. Pulls articles and research with source URLs so every claim is cited.
- **News** (NewsAPI or equivalent)  -  Optional. Adds a recency filter on top of research.
- **Social / professional network** (LinkedIn, X)  -  Required for `feed-digest` mode. If you ask for a feed digest and no social provider is connected I stop and ask you to connect one.

If no web research provider is connected for topic or entity briefs I stop and ask you to connect a research provider first.

## Information I need

I read your operations context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Topic, entity, or feed**  -  Required. Why I need it: skill targets one subject at a time. If missing I ask: "What should I synthesize  -  a topic, a specific company or person, or your social feed?"
- **Active priorities**  -  Required. Why I need it: drives the 'so what for us' section instead of generic news. If missing I ask: "What are the 2 to 3 things the company is pushing on this quarter?"
- **Key contacts**  -  Optional. Why I need it: lets me flag posts from people you already trust as higher signal. If you don't have it I keep going with TBD using recency and authority alone.
- **Time window**  -  Optional. Why I need it: weekly briefings default to 7 days, deep research to 30. If you don't have it I keep going with TBD using these defaults.

## Steps
<!-- houston-workflow:v1 -->

1. **Read `context/operations-context.md`.** Relevance anchors off founder's active priorities. If missing: `set-up-my-ops-info` first, stop.

2. **Classify request.**
   - **topic-brief**  -  "{topic}" (AI agents, vertical SaaS pricing, etc.). Use news + research sources.
   - **entity-brief**  -  named company, person, or product. Research-heavy; check news too.
   - **feed-digest**  -  founder's watched social feed (followers on X / LinkedIn / etc.). Needs connected social provider.

3. **Gather signal per classification.**

   **topic-brief + entity-brief:**
   - `composio search research` → execute by slug with query. Prefer providers returning source URLs (Exa, Perplexity).
   - `composio search news` → execute with time window (last 7 days default for weekly; last 30 for deep).

   **feed-digest:**
   - `composio search social` → list-home-timeline or list-posts-by-list tool for connected provider.
   - Pull posts from founder's follow-list for requested window.

4. **Filter and rank.**
   - Drop duplicates and near-duplicates.
   - Flag posts/articles from Key Contacts (from operating context) as higher-signal.
   - Rank by: (a) relevance to active priorities, (b) recency, (c) source authority.

5. **Synthesize structured brief.**

   Save to `signals/{slug}-{YYYY-MM-DD}.md`. Structure:

   - **TL;DR**  -  3 bullets max, founder-scannable.
   - **What moved**  -  grouped subsections by theme. Each bullet: claim + source URL. Cite every claim  -  no uncited assertions.
   - **Who's taking which position**  -  when sources contradict, list positions and who holds each.
   - **So what for us**  -  2-3 items: what threatens, what opens door, what goes in next investor/board update.
   - **Sources**  -  flat URL list with one-line descriptions, alphabetized by domain.

6. **Atomic writes**  -  `signals/{slug}-{YYYY-MM-DD}.md.tmp` → rename.

7. **Append to `outputs.json`** with `type: "signal"`, status "ready".

8. **Summarize to user**  -  TL;DR + the one "so what for us" item most warranting action.

## Outputs

- `signals/{slug}-{YYYY-MM-DD}.md`
- Appends to `outputs.json` with `type: "signal"`.

## What I never do

- **Cite without source URL.** Every claim traces to specific article or post  -  no "industry consensus" hand-waving.
- **Repost quote from founder's follow-list** to their own social  -  signal skill read-only.
- **Mark brief ready without uncertainty flags.** Single-source claim → flag it; sources contradict → say so.