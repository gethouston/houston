---
name: compare-competitors
description: "Hand me 2-5 companies and I'll produce a side-by-side comparison table across positioning, product, pricing, ICP, and GTM motion. Great before a pricing decision, a board update, or a sales call where you'll face objections."
version: 1
category: Research
featured: yes
image: bar-chart
integrations: [firecrawl, perplexityai, linkedin]
---


# Compare Competitors

## When to use

- "compare {A} vs {B}"
- "competitive landscape for {space}"
- "how do we stack up against {list}"
- "comparison table for {market}"

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Web research** (Firecrawl / Perplexity)  -  fetch any profiles not already cached. Required.
- **Professional network** (LinkedIn)  -  pulls team size delta for the headcount column. Optional.

If no web research tool is connected I stop and ask you to link one from the Integrations tab.

## Information I need

I read your research context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **The list of companies**  -  Required. 2 to 5. If missing I ask: "Which companies should I compare? List them by name or give me URLs."
- **Comparison dimensions**  -  Optional. Default: all 5 (positioning, product, pricing, ICP, GTM). Override: "just pricing and ICP" narrows output.
- **Whether to include your company**  -  Optional. If your own positioning / pricing / ICP is stored in context, I add a "You" column.

## Steps

0. **Read `config/context-ledger.json`.** Load `domains.competitive`. Check if your own context (company, ICP, pricing) is stored.
1. **Resolve company list.** For each company: check `competitors.json` for existing profile. If profile exists and `last_updated` within 30 days, use cached. If missing or stale, run `profile-a-competitor` as a sub-task inline (do not ask user to run it separately).
2. **Ensure all companies have profiles** before building the table. Wait for sub-tasks if any needed.
3. **Build comparison matrix.** For each dimension:
   - **Positioning**  -  one-line value prop per company.
   - **Primary ICP**  -  inferred target customer segment.
   - **Product depth**  -  top 2-3 features; any AI/automation edge.
   - **Pricing model**  -  free/freemium/paid-only + entry price if visible.
   - **GTM motion**  -  inferred: product-led, sales-led, or hybrid (signals: free tier = PLG; SDR job postings = sales-led).
4. **Write comparison** to `comparisons/{slug}.md` where slug = kebab-cased company names joined by `-vs-` (truncate at 3 names if more: `a-vs-b-vs-c-plus-2`).
5. **Add Key takeaways section** (3 bullets max): biggest differentiator between companies, any pricing gap worth exploiting, which competitor is moving fastest (signal: recent news + hiring).
6. **Upsert entry** in `comparisons-index.json`: slug, companies list, `created_at`, path.
7. **Append to `outputs.json`** with `type: "comparison"`, `domain: "competitive"`, title = "{A} vs {B} (+ N more)", path.
8. **Show user the table inline** in chat (markdown renders fine). Add the 3 key takeaways below it. Never mention file paths.

## Outputs

- Writes: `comparisons/{slug}.md` (full comparison table + takeaways)
- Upserts: `comparisons-index.json` (index entry)
- Appends: `outputs.json` with `type: "comparison"`, `domain: "competitive"`

## Source integrity rules

- Every cell from a live source: add a footnote `[source]` row at the bottom of the table.
- Cells where data wasn't publicly available: write "Not public" rather than guessing.
- Funding / headcount older than 6 months: mark "(stale)".
