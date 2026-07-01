---
name: track-a-trend
description: "Tell me a topic, space, or keyword and I'll pull the last 30 days of signal from the web, Reddit, and Twitter. I group it into themes and tell you what's worth paying attention to — and what's noise."
version: 1
category: Research
featured: yes
image: chart-increasing
integrations: [perplexityai, reddit, twitter]
---


# Track a Trend

## When to use

- "what's trending in {space}"
- "summarize recent news on {topic}"
- "what's the buzz around {keyword}"
- "is {technology} gaining traction"
- "track {trend} for me"

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **AI search** (Perplexity)  -  pulls web-wide signal on the topic. Required.
- **Social** (Reddit via Composio)  -  surfaces community discussion and sentiment. Optional.
- **Social** (Twitter/X via Composio)  -  high-engagement posts on the keyword. Optional.

I proceed with just Perplexity if Reddit and Twitter are not connected.

## Information I need

I read your research context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **The topic, space, or keyword**  -  Required. If missing I ask: "What topic or space do you want me to track? Give me a keyword or phrase."
- **Time window**  -  Optional. Default: last 30 days. Override: "last week" or "last quarter."
- **Industry filter**  -  Optional. If your industry is in context-ledger, I use it to filter noise. If not, I cover the topic broadly.

## Steps

0. **Read `config/context-ledger.json`.** Load industry context and any previously tracked topics from `domains.monitoring`.
1. **Pull Perplexity** via `composio search perplexity`: last 30 days news on topic. Minimum 10 results. Query: `"{topic}" (launch OR trend OR shift OR growth OR funding OR regulation)`.
2. **Pull Reddit** (if connected) via `composio search reddit`: top posts last 30 days in relevant subreddits. Surface posts with 50+ upvotes or 20+ comments.
3. **Pull Twitter/X** (if connected) via `composio search twitter`: recent posts with high engagement on the keyword. Surface top 5 by engagement.
4. **Cluster signals** into 3-5 themes. Discard PR fluff (press releases, sponsored content, obvious marketing).
5. **For each theme**: 2-3 supporting signals with source URL + date, plus a one-line "why this matters" assessment.
6. **Add a "What's noise" section**: signals that seemed big but lack substance (single-source claims, sponsored content, hype without data).
7. **Write** to `trends/{topic-slug}-{YYYY-MM-DD}.md`. Append to `outputs.json` with `type: "trend-report"`, `domain: "market"`.
8. **Chat summary**: theme names + single most actionable insight. No file paths.

## Outputs

- Writes: `trends/{topic-slug}-{YYYY-MM-DD}.md` (themed trend report)
- Appends: `outputs.json` with `type: "trend-report"`, `domain: "market"`

## Source integrity rules

- Every signal cites source URL and date.
- Sponsored content and press releases marked as such, not treated as organic signal.
- Single-source claims go in the "noise" section unless independently corroborated.
- Engagement metrics reported as-is  -  never inflated or estimated.
