---
name: run-due-diligence
description: "Vet a company before you partner, invest, or sign a contract. I check their funding history, leadership background, press coverage, customer reviews, and surface any red flags. Output is a structured risk summary."
version: 1
category: Research
featured: no
image: shield
integrations: [perplexityai, firecrawl, linkedin]
---


# Run Due Diligence

## When to use

- "DD on {company}"
- "vet {partner or vendor}"
- "should we work with {company}"
- "red flags on {company}"
- "due diligence on {company}"

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **AI search** (Perplexity)  -  pulls funding history, press coverage, controversy checks. Required.
- **Web scraping** (Firecrawl)  -  scrapes review sites (G2, Capterra) and company pages. Optional but strongly recommended.
- **Professional network** (LinkedIn)  -  pulls leadership backgrounds, tenure patterns, headcount trends. Optional but strongly recommended.

If no Perplexity connected I stop and ask you to link it from the Integrations tab.

## Information I need

I read your research context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **The company to vet**  -  Required. If missing I ask: "Which company do you want me to vet? Give me the name or URL."
- **The relationship type**  -  Optional. Default: partnership/vendor. Override: "investor DD" or "acquisition target" changes what I prioritize. If not obvious I ask: "Is this for a partnership, a vendor contract, an investment, or something else?"
- **Specific concerns**  -  Optional. "I heard they had layoffs" or "check their data security" narrows what I look deeper into.

## Steps

0. **Read `config/context-ledger.json`.** Load any prior context on this company from `domains.competitive` or `domains.prospects`.
1. **Profile company.** Check `competitors.json` for existing profile. If not cached or stale, run `profile-a-competitor` inline via Firecrawl + Perplexity. Use the profile as a foundation.
2. **Leadership check** via LinkedIn (if connected, discover slug with `composio search linkedin`): pull founders and C-suite. For each: current tenure, prior companies, any notable exits, failures, or public controversy. Flag short tenure patterns (< 1 year for multiple C-suite = yellow flag).
3. **Financial signals** via Perplexity: last known funding round + investors. Specific flags:
   - VC-backed but no funding in 2+ years = yellow flag.
   - Down round or bridge round = yellow flag.
   - Profitable bootstrapped = neutral/positive.
   - Recent large round = positive signal.
4. **Customer sentiment**: search `"{company}" review` on Perplexity. Scrape G2/Capterra pages via Firecrawl if connected. Surface top 3 positive themes + top 3 negative themes. Note review volume  -  low volume is itself a signal.
5. **Press / controversy check** via Perplexity: any negative press, regulatory issues, data breaches, lawsuits, layoffs in last 12 months? Each finding gets severity (low/medium/high) and source URL.
6. **Build risk summary**:
   - **GREEN** = no flags, company looks solid.
   - **YELLOW** = minor flags, manageable with due care.
   - **RED** = significant concerns, proceed with caution.
   - List each flag with severity, evidence, and source.
7. **Write** to `due-diligence/{slug}-{YYYY-MM-DD}.md`. Append to `outputs.json` with `type: "due-diligence"`, `domain: "prospects"`.
8. **Chat summary**: risk level (GREEN/YELLOW/RED) + the single most important flag found. Never fabricate  -  if unverifiable, say so. No file paths.

## Outputs

- Writes: `due-diligence/{slug}-{YYYY-MM-DD}.md` (structured risk summary)
- Appends: `outputs.json` with `type: "due-diligence"`, `domain: "prospects"`

## Source integrity rules

- Every flag cites source URL and date.
- Absence of information is reported honestly  -  "no public funding data found" not "unfunded."
- Review sentiment summarized from actual reviews  -  never invented.
- Risk level reflects evidence found, not gut feeling. No flag = GREEN, period.
