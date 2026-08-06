---
name: research-a-market
description: "Give me a market or industry and I'll produce a structured brief: estimated size and growth rate, key players, buyer segments, distribution channels, and the top 3 trends reshaping it. Cites sources throughout."
version: 1
category: Research
featured: no
image: globe-showing-americas
integrations: [perplexityai, firecrawl, ahrefs]
---


# Research a Market

## When to use

- "research the {X} market"
- "how big is the {Y} space"
- "market overview for {Z}"
- "what's the {industry} landscape"
- "TAM for {category}"

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **AI search** (Perplexity)  -  pulls market sizing, analyst reports, trend data. Required.
- **Web scraping** (Firecrawl)  -  scrapes industry report pages for deeper data. Optional.
- **SEO / backlinks** (Ahrefs)  -  search volume for category keywords signals market interest. Optional.

If no Perplexity connected I stop and ask you to link it from the Integrations tab.

## Information I need

I read your research context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **The market or industry**  -  Required. If missing I ask: "Which market or industry should I research? Give me the space or category name."
- **Geographic scope**  -  Optional. Default: global. Override: "US only" or "APAC."
- **Depth level**  -  Optional. Default: full brief. Override: "just the size and growth rate" or "just the key players."

## Steps

0. **Read `config/context-ledger.json`.** Check `domains.market` for any previously researched markets. If this market was researched and `last_updated` is within 60 days, ask: "I have a report from {date}, want me to refresh it or use the existing one?"
1. **Pull market size + CAGR** via Perplexity: look for analyst reports (Gartner, IDC, Grand View, Statista, Fortune Business Insights). Surface top 2-3 estimates with source URL and publication year. Flag any estimate older than 2 years.
2. **Pull key players**: top 5-7 companies by market presence or funding. For each: name, one-line positioning, estimated market position if available.
3. **Infer buyer segments**: who buys in this market? Segment by company size (SMB/mid-market/enterprise), by function (engineering/marketing/ops), and by vertical if applicable.
4. **Pull top 3 trends**: what's driving growth or disruption (AI adoption, regulation, consolidation, new entrant models, pricing shifts). Each trend gets 2-3 supporting data points with sources.
5. **Scrape industry report pages** via Firecrawl (if connected): any freely accessible analyst summary pages. Extract stats not found via Perplexity.
6. **Pull search volume** via Ahrefs (if connected): category keywords and monthly search volume trends. Rising search = growing interest.
7. **Write** to `market-briefs/{market-slug}.md`. Include source URLs and dates for every stat.
8. **Append to `outputs.json`** with `type: "market-research"`, `domain: "market"`.
9. **Chat summary**: market size + growth rate + single most important trend. Flag if any estimate is older than 2 years. No file paths.

## Outputs

- Writes: `market-briefs/{market-slug}.md` (full market brief)
- Appends: `outputs.json` with `type: "market-research"`, `domain: "market"`

## Source integrity rules

- Every stat cites source URL, publisher name, and publication year.
- Multiple estimates for the same metric: show all with sources, note the range.
- Flag any data older than 2 years as "(dated, verify current figures)".
- Never present a single analyst estimate as fact  -  say "estimated at" with the source.
