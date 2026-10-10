---
name: find-similar-companies
description: "Give me a company you love (a customer, a competitor, or a reference point) and I'll find 10-20 companies that look just like it. Useful for building a target account list, finding distribution partners, or mapping adjacent markets."
version: 1
category: Research
featured: no
image: busts-in-silhouette
integrations: [perplexityai, linkedin, firecrawl]
---


# Find Similar Companies

## When to use

- "find companies like {example}"
- "who else does {Y}"
- "lookalikes for {company}"
- "give me a target list similar to {company}"
- "who else looks like our best customers"

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **AI search** (Perplexity)  -  finds companies matching the profile. Required.
- **Professional network** (LinkedIn)  -  validates company size, industry, and stage. Optional.
- **Web scraping** (Firecrawl)  -  scrapes company pages for positioning and tech signals. Optional.

If no Perplexity connected I stop and ask you to link it from the Integrations tab.

## Information I need

I read your research context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **The reference company**  -  Required. If missing I ask: "Which company should I use as the reference? Give me the name or URL."
- **What makes them a good match**  -  Optional. Default: I infer from their profile (industry, size, stage, tech). Override: "same size, B2B SaaS, Series A" narrows the criteria.
- **How many results**  -  Optional. Default: 10-20. Override: "just the top 5" or "give me 30."

## Steps

0. **Read `config/context-ledger.json`.** Load ICP from `universal.ideal_customer` if stored.
1. **Profile the reference company.** Check `competitors.json` for existing profile. If not cached or stale, run `profile-a-competitor` inline. Extract: industry, size range, funding stage, tech signals, geography, business model.
2. **Build a search brief**: "companies that are {industry}, {size range}, {funding stage}, using {tech signals}, in {geography}." Run via Perplexity.
3. **Pull 10-20 companies.** For each: name, website, one-line description, why it matches the reference.
4. **Validate** via LinkedIn (if connected): confirm company size and industry for each result. Drop any that don't match on core criteria.
5. **Deduplicate** against existing `competitors.json` and `prospects.json`. Mark any that already appear in your data.
6. **Write** to `target-lists/{reference-slug}-similars-{YYYY-MM-DD}.md`.
7. **Append to `outputs.json`** with `type: "similar-companies"`, `domain: "prospects"`.
8. **Chat**: show the list as a table (name | description | why it matches). No file paths.

## Outputs

- Writes: `target-lists/{reference-slug}-similars-{YYYY-MM-DD}.md` (company list with match rationale)
- Appends: `outputs.json` with `type: "similar-companies"`, `domain: "prospects"`

## Source integrity rules

- Every company listed must have a verifiable website URL.
- "Why it matches" must cite at least one concrete signal (industry, size, tech, stage)  -  not just "similar vibes."
- If LinkedIn data contradicts web data on size or industry, note the discrepancy.
- Never pad the list with companies that don't match core criteria just to hit a count target.
