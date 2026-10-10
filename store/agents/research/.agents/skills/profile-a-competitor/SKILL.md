---
name: profile-a-competitor
description: "Give me a company name and I'll build a full competitor profile: positioning, product, pricing, recent moves, hiring signals, and funding status. Takes 3-5 minutes. Output is a structured brief you can reference any time."
version: 1
category: Research
featured: yes
image: magnifying-glass-tilted-left
integrations: [firecrawl, perplexityai, linkedin]
---


# Profile a Competitor

## When to use

- "research {company}"
- "competitor profile on {company}"
- "who is {company}"
- "build a profile for {competitor}"
- Implicit: before `compare-competitors` runs, I auto-run this for any company not already in `competitors.json`.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Web research** (Firecrawl / Perplexity)  -  scrape their site, pull recent news. Required.
- **Professional network** (LinkedIn)  -  pull employee count, hiring signals, recent leadership posts. Optional but improves signal quality.

If no web research tool is connected I stop and ask you to link one from the Integrations tab.

## Information I need

I read your research context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **The company name or URL**  -  Required. Why I need it: it's the input to the entire profile. If missing I ask: "Which company do you want me to profile? Give me the name or their website."
- **What you want to compare against (your company)**  -  Optional. Why I need it: if provided, I call out direct overlaps and positioning gaps. If missing I skip the comparison angle.
- **Which aspects matter most**  -  Optional. Default: all six sections. Override: "just pricing and product" narrows the output to those sections only.

## Steps

0. **Read `config/context-ledger.json`.** Load `domains.competitive` for any previously stored context (industry, your ICP, known competitor list).
1. **Resolve company URL.** If only a name given, use Perplexity via `composio search perplexity` to find the canonical domain. Save slug = kebab-cased company name.
2. **Check `competitors.json`.** If slug already exists and `last_updated` is within 30 days, ask: "I have a profile from {date}, want me to refresh it or use the existing one?"
3. **Scrape their site** via Firecrawl (discover slug with `composio search firecrawl`): homepage, /pricing, /about, /blog (last 3 posts). Extract: tagline, pricing model (free/freemium/paid tiers), customer segments mentioned, features listed on homepage.
4. **Pull recent news** via Perplexity: last 90 days. Query: `"{company}" (funding OR launch OR partnership OR acquisition OR layoffs)`. Extract up to 5 signal items with date and source URL.
5. **Pull LinkedIn signals** via Composio LinkedIn search (if connected): current employee count, 30-day headcount delta (growing/shrinking), top 3 open roles (signals where they're investing).
6. **Build profile struct** with 6 sections:
   - **Positioning**  -  tagline + inferred ICP (who they serve) + primary value prop.
   - **Product**  -  top 3 features, any AI/automation capability mentioned.
   - **Pricing**  -  model (freemium/trial/paid-only), entry price if visible, enterprise tier if visible.
   - **Recent moves**  -  top 3 signals from step 4 with dates.
   - **Team**  -  employee count + 30-day delta + top 3 open roles.
   - **Funding**  -  last known round, total raised, investors (from Perplexity; flag if older than 1 year).
7. **Write brief** to `briefs/{slug}.md`. Upsert entry in `competitors.json` with slug, name, url, `last_updated: today`, `brief_path`.
8. **Append to `outputs.json`** with `type: "competitor-profile"`, `domain: "competitive"`, title = company name, summary = one-line positioning summary, path = `briefs/{slug}.md`.
9. **Summarize to user** in plain language: headline positioning + the single most surprising signal found. Never mention file paths.

## Outputs

- Writes: `briefs/{slug}.md` (full competitor profile)
- Upserts: `competitors.json` (index entry)
- Appends: `outputs.json` with `type: "competitor-profile"`, `domain: "competitive"`

## Source integrity rules

- Cite every factual claim with source URL and date.
- If a pricing page is gated or missing, note "pricing not public" rather than guessing.
- Flag any data point older than 90 days with "(as of {date}, may be stale)".
- Never invent funding numbers, headcount, or feature details.
