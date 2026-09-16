---
name: audit-a-surface
description: "Grade a specific marketing surface and get a prioritized fix list. Pick what to audit: your site's SEO health, your visibility in AI search engines like ChatGPT and Perplexity, a landing page scored on six dimensions, or a form that's leaking conversions. Every finding ranked by impact and ease."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [firecrawl, semrush, ahrefs, perplexityai]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Audit A Surface

Four possible audit surfaces. `surface` param picks probe;

## Parameter: `surface`

- `site-seo`  -  on-page + technical + content audit of configured
  domain via Semrush / Ahrefs / Firecrawl.
- `ai-search`  -  ChatGPT / Perplexity / Gemini / Google AI Overviews
  visibility probe + GEO recs.
- `landing-page`  -  fetch via Firecrawl, score 6 dimensions 0-3,
  prioritized fix list.
- `form`  -  flag unnecessary fields, rewrite labels + helper text,
  sequence by friction (non-signup forms  -  demo / contact / lead /
  checkout).

User names surface in plain English ("SEO audit", "GEO", "teardown my landing page", "fix my demo form") -> infer. Ambiguous -> ask ONE question naming 4 options.

## When to use

- Explicit: "run an SEO audit", "audit AI search visibility", "GEO
  audit", "critique {URL}", "audit my lead form".
- `ai-search` triggers: "do I show up in ChatGPT?", "are we visible
  in Perplexity / Gemini for our category?", "who shows up when
  someone asks about {category} in ChatGPT?".
- `form` triggers: "audit my demo form", "my contact form is
  leaking", "this lead form is too long  -  what can I cut?",
  "rewrite the labels on this form", "review the fields on the
  application / checkout form".
- Implicit: inside `plan-a-campaign` (paid / launch) when routed
  landing page needs sharpening, or inside `check-my-marketing` (content-gap)
  when baseline site health unknown.
- Per-surface cadence: site-seo weekly max, ai-search monthly max,
  landing-page on demand, form on demand.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing -> I name the category, ask you to connect it from the Integrations tab, stop.

- **Web scrape (Firecrawl)**  -  optional. If not connected I fall back to basic HTTP fetch for `landing-page`, `form`, and the on-page pass of `site-seo`, rougher but workable on static pages.
- **SEO (Semrush or Ahrefs)**  -  on-page audit, indexation, content-fit, ranking data. Required for `site-seo`  -  no fallback, that data is proprietary.
- **AI search (Perplexity / search providers)**  -  probe ChatGPT / Perplexity / Gemini / AI Overviews for your visibility. Required for `ai-search`  -  no useful fallback, the engines need API access.

For `site-seo` I stop if no SEO tool is connected. For `ai-search` I stop if no AI-search provider is connected. For `landing-page` and `form`, basic HTTP fetch covers the scrape fallback so I keep going.

## Information I need

I read your marketing context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your positioning**  -  Required. Why I need it: every audit grades content against who you serve and what you stand for. If missing I ask: "Want me to draft your positioning first? It's one skill, takes about five minutes."
- **Your ideal customer**  -  Required for `landing-page` and `form` (so I can grade objection handling and field choices). If missing I ask: "Who is the customer you want this page or form to convert? A short paragraph or paste from your CRM works."
- **Your website domain**  -  Required for `site-seo` and `ai-search`. If missing I ask: "What's the domain you want me to audit? Paste the URL."
- **Your SEO tool**  -  Required for `site-seo` and `ai-search`. If missing I ask: "Open Integrations and connect Semrush or Ahrefs, or paste a list of pages you want me to grade."

## Steps
<!-- houston-workflow:v1 -->

1. **Read ledger + positioning.** Gather missing required fields per
   above (ONE question each, best-modality first). Write atomically.
2. **Discover tools via Composio.** Run `composio search seo` /
   `composio search web-scrape` / `composio search ai-search` /
   `composio search perplexity` per surface. For `site-seo` and
   `ai-search`, stop if no proprietary tool is connected (SEO data
   and AI-search probes can't be replicated). For `landing-page` and
   `form`, fall back to basic HTTP fetch when Firecrawl is missing
   and flag JS-heavy pages where the result is thin.
3. **Branch on surface.**
   - `site-seo`: execute discovered tool slugs against domain +
     key URLs, three passes:
     - **On-page**  -  title tags, meta descriptions, H1/H2 hierarchy,
       canonical tags, schema, alt text, internal linking.
     - **Technical**  -  robots.txt / sitemap, indexation, Core Web
       Vitals, mobile usability, HTTPS, broken links, redirects.
     - **Content**  -  top-performing pages, thin content,
       cannibalization, content-vs-positioning fit.
   - `ai-search`: build query set (3 buckets of 3-5 queries each):
     **Brand** ("what is {product}", "{product} vs {competitor}",
     "{product} pricing"), **Category** (top JTBD questions from
     positioning), **Problem** (ideal customer pain-point phrasings). Query each
     engine via discovered slugs  -  minimum ChatGPT / Perplexity /
     Gemini / Google AI Overviews. Per query-engine pair capture:
     cited (yes / mentioned / no), citing URL, who cited instead,
     AI's category framing.
   - `landing-page`: execute web-scrape slug to fetch URL
     (rendered HTML + visible text + primary images + meta + any
     page-speed signals). Score 6 dimensions 0-3 with one-sentence
     reason quoting page:
     1. **Headline clarity** (WHO + WHAT in <=12 words).
     2. **Value prop above fold** (outcome visible without
        scrolling).
     3. **Social proof** (credibility + proximity to CTA).
     4. **Primary CTA** (one unambiguous action matching primary
        conversion).
     5. **Objection handling** (FAQ / guarantee / pricing against
        top 2-3 ideal customer objections from positioning).
     6. **Visual hierarchy** (eye-path -> CTA, no competing CTAs).
     Bonus: page-speed signals if tool returns them.
   - `form`: accept URL, screenshot, or pasted field list. URL ->
     execute web-scrape slug. Identify form type (lead / contact /
     demo / application / survey / checkout  -  NOT signup, that's
     `write-my-page-copy` surface=signup-flow). Ask ONE question on
     business context if unclear (what happens to submissions,
     which fields get used in follow-up, compliance). Field-by-field:
     **Verdict** (keep / drop / defer / make-optional /
     compliance-required), **Reason**, **Label rewrite**
     (conversational, one question per field), **Input-type fix**
     (mobile keyboard, inline validation, smart defaults, email
     typo detection). Rewrite value prop above form. Name
     anti-patterns (cognitive-load, privacy-anxiety-no-trust,
     missing-value-prop, too-many-fields, poor-mobile-keyboard,
     error-shaming, captcha-above-submit, no-progress-signal).
     Replace "Submit" with action + outcome.
4. **Score + prioritize.** Tag every finding `{severity: critical /
   high / medium / low}` x `{effort: quick-win / medium / heavy}`.
   Surface top 5 critical-or-high quick-wins at top. For
   `landing-page`, include the per-dimension scorecard so the total
   is self-evident:
   ```
   Headline clarity       1/3
   Value prop above fold  1/3
   Social proof           3/3
   Primary CTA            1/3
   Objection handling     2/3
   Visual hierarchy       2/3
   Total                 10/21
   ```
   Always show all six rows + total. Never show just the total alone.
5. **Write** atomically to
   `audits/{surface}-{slug}-{YYYY-MM-DD}.md` (`*.tmp` -> rename).
   Slug: `site-seo` / `ai-search` use domain; `landing-page` /
   `form` use kebab of URL or form name. Structure: Executive
   summary -> Top 5 quick wins / biggest leak -> Findings by pass ->
   Recommended 30-day plan (site-seo) / Prioritized fix list
   (landing-page, form) / GEO recommendations (ai-search).
6. **Append to `outputs.json`**  -  read-merge-write atomically:
   `{ id (uuid v4), type: "audit", title, summary, path, status:
   "ready", createdAt, updatedAt }`.
7. **Summarize to user.** One paragraph with top 5 quick-wins
   (or single biggest fix) and path.

## What I never do

- Invent findings, cite rates, form field counts. Every claim ties
  to real tool response or URL observation. Missing data -> marked
  UNKNOWN or TBD.
- Promise lift percentage  -  audits surface hypotheses.
- Drop legally required form field (ask if uncertain).
- Hardcode tool names  -  Composio discovery at runtime only.

## Outputs

- `audits/{surface}-{slug}-{YYYY-MM-DD}.md`
- Appends entry to `outputs.json` with type `audit`.
