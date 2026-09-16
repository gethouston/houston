---
name: research-an-account
description: "Research a target account or contact at the depth you need: a 30-second qualify on a URL, a full cited brief with site scrape and twelve weeks of news, an enrichment on a named person, or a warm-paths search across your CRM and LinkedIn. Every claim cites a real source - no invented news, funding, or connections."
version: 1
category: Sales
featured: no
image: handshake
integrations: [gmail, hubspot, salesforce, attio, linkedin, firecrawl, perplexityai]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Research An Account

One skill, four research shapes. `depth` param pick pass. Source-citation + "never invent fact" discipline shared.

## Parameter: `depth`

- `quick-qualify`  -  30-sec read of single URL. One scrape, one decision (GOOD-FIT / BORDER / OUT), one angle if GOOD-FIT. Fast triage, not brief.
- `full-brief`  -  multi-pass cited brief on named account: site scrape, recent news (12 weeks), tech-stack detect, social scan, intent signals. Feeds outreach + call prep.
- `enrich-contact`  -  named person: firmographics, role context, reporting line if discoverable, recent posts/talks, trigger signals. For outreach personalization.
- `warm-paths`  -  first-degree intros: search connected LinkedIn/Gmail/CRM for people who know someone at target. Rank paths by strength.

User ask imply depth ("quick read", "go deep", "enrich this person", "who do I know there") → infer. Else ask ONE question naming 4 options.

## When to use

- Explicit triggers in description.
- Implicit: inside `write-my-outreach stage=cold-email` (cold email need signal  -  this skill find it) and `prep-a-meeting type=call` (call need brief).

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Scrape**  -  read the company's site, product pages, tech-stack signals. Required for `quick-qualify` and `full-brief`.
- **Search / research**  -  pull recent news, funding, hires for `full-brief` and `enrich-contact`. Required for those depths.
- **Social**  -  read public LinkedIn profile and posts for `enrich-contact` and `warm-paths`. Required for those depths.
- **CRM**  -  cross-reference first-degree connections and prior touches for `warm-paths`. Required for that depth.
- **Inbox**  -  cross-reference who you've emailed at the target for `warm-paths`. Optional.

If none of the required categories for the chosen depth are connected I stop and ask you to connect Firecrawl first since most depths build off the site read.

## Information I need

I read your sales context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your sales playbook**  -  Required. Why I need it: Your ideal customer profile and differentiators ground the qualify decision and brief framing. If missing I ask: "I don't have your playbook yet  -  want me to draft it now?"
- **The target company name or URL**  -  Required for `quick-qualify`, `full-brief`, `warm-paths`. Why I need it: scrape and news search anchor on it. If missing I ask: "Which company should I research  -  paste the homepage URL or tell me the name?"
- **The target person's name and company**  -  Required for `enrich-contact`. Why I need it: the enrichment is grounded to a real LinkedIn profile. If missing I ask: "Who should I enrich  -  full name and company?"
- **Connected CRM**  -  Required for `warm-paths`. Why I need it: I cross-reference your past touches and mutual customers. If missing I ask: "Connect your CRM (HubSpot, Salesforce, Attio, Pipedrive, or Close) so I can find warm paths."

## Steps
<!-- houston-workflow:v1 -->

1. **Read ledger + playbook.** Gather missing required fields (ONE question each, best-modality first). Write atomically.

2. **Discover tools via Composio.** `composio search web-scrape` / `composio search search-research` / `composio search crm` / `composio search linkedin` per depth. No tool for required category connected → name category to link, stop.

3. **Branch on depth.**
   - `quick-qualify`: scrape URL (one request). Extract: what they do, who they sell to, team size signal, tech stack signal. Apply playbook disqualifiers. Output: **GOOD-FIT** / **BORDER** / **OUT** + one-sentence reason + one angle (single pain from playbook best matching them). Save tight `leads/{slug}/qualify-{YYYY-MM-DD}.md` (~150 words max).
   - `full-brief`: run scrape, search last 12 weeks news (funding, hires, product launches, leadership changes), detect tech stack (BuiltWith-style signals via scrape), scan company LinkedIn posts. Structure: **Snapshot** (one paragraph) → **Recent signals** (5-8 bullets, each cited w/ URL + date) → **Tech stack** (5-10 signals) → **Buying committee guesses** (pull from LinkedIn when available) → **Angles for outreach** (3 angles ranked, each tied to cited signal). Save to `accounts/{slug}/brief-{YYYY-MM-DD}.md`.
   - `enrich-contact`: search person via LinkedIn + connected CRM/email enrichment. Capture: title, company, tenure, prior companies, visible posts/talks/podcasts last 6 months, trigger signal (new role, speaker, press). Save to `leads/{slug}/enrichment-{YYYY-MM-DD}.md`.
   - `warm-paths`: via LinkedIn (Composio), find first-degree connections at target company. Cross-ref CRM for mutual-customer or mutual-investor paths. Rank: **Strong** (close connection, recent touch), **Medium** (weak tie, stale), **Weak** (third-degree only). Draft intro ask per strong path. Save to `leads/{slug}/warm-paths-{YYYY-MM-DD}.md`.

4. **Cite every claim.** No uncited facts. Any claim without URL or CRM field reference marked `(hypothesis  -  verify)`.

5. **Append to `outputs.json`**  -  read-merge-write atomically: `{ id (uuid v4), type: "account-brief" | "contact-enrichment" | "warm-paths" | "lead-batch" (for quick-qualify), title, summary, path, status: "ready", createdAt, updatedAt, domain: "outbound" }`.

6. **Summarize to user.** Top finding + path. Suggest next skill ("`write-my-outreach stage=cold-email` using angle #1?" or "`prep-a-meeting type=call` if this turns into meeting?").

## What I never do

- Invent news, funding, hires, tech-stack facts, connections. Every claim cite source.
- Scrape private data  -  LinkedIn public profile, company website, public news only.
- Enrich contact personal life beyond professional footprint.

## Outputs

- `quick-qualify` → `leads/{slug}/qualify-{YYYY-MM-DD}.md`
- `full-brief` → `accounts/{slug}/brief-{YYYY-MM-DD}.md`
- `enrich-contact` → `leads/{slug}/enrichment-{YYYY-MM-DD}.md`
- `warm-paths` → `leads/{slug}/warm-paths-{YYYY-MM-DD}.md`
- Appends to `outputs.json`.