---
name: research-my-seo
description: "Build the SEO foundation you need to rank. Pick the focus: keyword research that clusters terms by intent and difficulty and names the pillars worth owning, or a backlink plan that finds target sites and drafts a personalized pitch for each one. Both grounded in your positioning so you chase the right traffic."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [semrush, ahrefs, firecrawl]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Research My SEO

One skill for the two foundational SEO research jobs. `focus` param picks whether you're building keyword clusters or a backlink outreach plan. Both read your positioning first so every recommendation ladders back to your ideal customer and category.

## Parameter: `focus`

- `keywords`  -  cluster terms by intent and difficulty via Semrush / Ahrefs, flag the 3 pillars worth owning, draft cluster briefs. Living `keyword-map.md` appends each new cluster. Output: `keyword-clusters/{cluster-slug}.md` + updates `keyword-map.md`.
- `backlinks`  -  identify 15-30 target sites via SERP + backlink tool, tier by effort, draft a personalized pitch email for each one. Output: `backlink-plans/{YYYY-MM-DD}.md`.

User names focus in plain English ("find keywords for {topic}", "build a keyword map", "who should we pitch for links", "link-building plan") -> infer. Ambiguous -> ask ONE question naming both options.

## When to use

**keywords:**
- Explicit: "find keywords for {topic}", "build a keyword map", "what should we rank for", "keyword research on {topic}", "give me a cluster for {seed term}".
- Implicit: called by `write-a-post` when target keyword missing, or by `check-my-marketing` (subject=content-gap) to size gap opportunities.
- Run many times  -  one cluster per invocation. Living `keyword-map.md` appends each new cluster.

**backlinks:**
- Explicit: "find backlinks", "who should we pitch for links", "link-building plan", "backlink targets for {topic}", "link prospecting".
- Implicit: inside a launch plan when external amplification needed.
- Weekly or per-campaign cadence.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing -> I name the category, ask you to connect it from the Integrations tab, stop.

- **SEO (Semrush or Ahrefs)**  -  Required (both focuses). For `keywords`: pulls volumes, difficulty, and intent for every term. For `backlinks`: finds the target sites worth pitching and grades their authority.
- **Web scrape (Firecrawl)**  -  Required for `backlinks` (reads the target's recent posts so the pitch references real work, not generic flattery). Not needed for `keywords`.
- **Inbox (Gmail, Outlook)**  -  Optional for `backlinks` (samples your voice for the pitch emails; drafts read flat without it). Not needed for `keywords`.

If no SEO tool is connected I stop and ask you to connect Semrush or Ahrefs (or paste a seed list of terms for `keywords`).

If neither Ahrefs nor Semrush is connected for `backlinks` I stop and ask you to connect one of them.

## Information I need

I read your marketing context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your positioning**  -  Required (both focuses). Why I need it: Ideal customer and category framing decide which keywords are worth ranking for (`keywords`) and which sites are relevant vs noise (`backlinks`). If missing I ask: "Want me to draft your positioning first? It's one skill, takes about five minutes."
- **Your website domain**  -  Required (both focuses). Why I need it: for `keywords` I check what you already rank for so I don't propose keywords you already own; for `backlinks` I check who already links to you so I don't pitch sites that already cover you. If missing I ask: "What's your website? Paste the URL."
- **The seed topic**  -  Required for `keywords`. Why I need it: one cluster per run, I don't want to guess. If missing I ask: "What's the seed topic or term you want a keyword cluster around?"
- **Your voice**  -  Required for `backlinks` pitch emails. If missing I ask: "Connect your sent inbox so I can match your voice, or paste two or three emails you've sent."
- **Topic or angle to pitch on**  -  Optional for `backlinks`. If missing I ask: "What angle do you want me to pitch on? If you don't have a preference I keep going with your core positioning."

## Steps
<!-- houston-workflow:v1 -->

### Shared steps (both focuses)

1. **Read positioning doc**: `context/marketing-context.md`. If missing, stop. Tell user run `set-up-my-marketing-info` first.
2. **Read config**: `config/site.json`, `config/tooling.json`.
3. **Discover tool**: `composio search keyword` (fall back `composio search seo`) for `keywords`; `composio search backlink` (fall back `composio search seo`, last resort `composio search web`) for `backlinks`. Pick first matching connected slug.

### Branch on `focus`:

#### `keywords`

4. **Check SEO tool connected.** No SEO keyword tool connected -> ask ONE question: "Connect a keyword tool in the Integrations tab (Semrush / Ahrefs / etc) or paste a seed list of terms you think matter  -  which?"
5. **Build cluster** for requested topic:
   - Expand seed into 15-40 related terms (head + long-tail).
   - Pull per-term: search volume, keyword difficulty, SERP intent (informational / commercial / navigational / transactional).
   - Group into sub-clusters by intent or sub-topic.
   - Score each term priority: `(volume / difficulty) x intent-fit x ideal-customer-fit`. Ideal-customer-fit references positioning doc.
6. **Write per-cluster detail** to `keyword-clusters/{cluster-slug}.md` atomically. Structure: cluster summary, ideal customer / positioning rationale, sub-clusters table (term / volume / difficulty / intent / priority), recommended first 3 posts to draft.
7. **Append to `keyword-map.md`** (living doc at agent root). File missing -> create with short preamble. Append new section for this cluster with link to per-cluster detail file + top 5 priority terms. Atomic write: read -> append in memory -> write `*.tmp` -> rename.
8. **Append to `outputs.json`**  -  `{ id, type: "keyword-map", title, summary, path: "keyword-clusters/{slug}.md", status: "draft", createdAt, updatedAt }`.
9. **Summarize to user**  -  name top 3 priority terms, flag best first post to draft, link both cluster detail + updated `keyword-map.md`.

#### `backlinks`

4. **Read `config/voice.md`** if exists (for pitch-email tone). If voice missing, ask ONE question: "Connect your sent inbox via Composio so I can match your voice, or paste 2-3 emails you've sent  -  which?"
5. **Build target list** (15-30 prospects). Each target:
   - Domain + specific page/author to pitch.
   - Why them: topical relevance, Domain Authority (or proxy metric), past linking behaviour to similar products, ideal customer overlap.
   - Link opportunity type: guest post / resource page / broken-link replacement / "best X" list addition / expert round-up / podcast.
6. **Tier list**: Tier 1 (high-value, high-effort), Tier 2 (medium / medium), Tier 3 (quick wins). Aim ~5 / 10 / 10.
7. **Draft per-target pitch emails.** Each target produce concise (<150 word) pitch: specific compliment tied to real post of theirs, value-exchange, soft CTA. Match voice from `config/voice.md` (if available) and positioning from shared doc.
8. **Write** to `backlink-plans/{YYYY-MM-DD}.md` atomically. Structure: Executive summary -> Tier 1 targets (table + per-target pitch) -> Tier 2 -> Tier 3 -> Outreach cadence recommendation.
9. **Append to `outputs.json`**  -  `{ id, type: "backlink-plan", title, summary, path, status: "draft", createdAt, updatedAt }`.
10. **Summarize to user**  -  count per tier, top 3 warmest targets, and path. Remind user: approval required before any pitch actually sent (skill drafts, not sends).

## What I never do

- Estimate volume/difficulty without tool result. Tool returned partial data -> mark gaps TBD.
- Fabricate SERP intent  -  read actual SERP when tool can fetch.
- Fabricate recipient's past work or publication's editorial interests. Every compliment tie to real URL.
- Mark Domain metrics tool didn't return as TBD, never invent.
- Send, post, or publish any pitch  -  founder delivers. Every outreach email is a draft you approve.

## Outputs

- `keyword-clusters/{cluster-slug}.md` (focus=keywords, per-cluster detail)
- `keyword-map.md` (focus=keywords, living document at agent root, appended each run)
- `backlink-plans/{YYYY-MM-DD}.md` (focus=backlinks)
- All append to `outputs.json` with matching `type`: `"keyword-map"` | `"backlink-plan"`.
