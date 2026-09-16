---
name: research-a-topic
description: "Get a structured brief on any topic you need to understand before making a marketing decision. I run deep research, cite every source, and deliver angles worth writing about. Feeds blog drafts, ad strategies, and content plans."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [firecrawl, perplexityai]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Research A Topic

Source template: Gumloop "AI Research Agent with Automated Report Generation". Adapted for hand-off to other four marketing agents, not 20-page investor memos.

## When to use

- "research {topic}" / "I need a brief on {topic}" / "what's state of {topic}".
- "summarize what's happening in {category}".
- Called implicitly by other skills (`plan-a-campaign`, `watch-my-competitors`, `profile-my-customer`) when they hit an evidence gap that needs a dedicated research run.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing -> I name the category, ask you to connect it from the Integrations tab, stop.

- **Web search (Exa or Perplexity)**  -  the engine that finds and ranks sources. Required  -  no useful fallback, I need a search index to start from.
- **Web scrape (Firecrawl)**  -  optional, fetches full text cleanly. If not connected I fall back to basic HTTP fetch on each source URL, rougher but enough to pull quotes from static pages.

If web search isn't connected I stop. The scrape fallback keeps me going on its own.

## Information I need

I read your marketing context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your positioning**  -  Required. Why I need it: a brief that doesn't filter for your ideal customer and category is just generic internet research. If missing I ask: "Want me to draft your positioning first? It's one skill, takes about five minutes."
- **The research question**  -  Required. Why I need it: scope creep makes briefs useless. If missing I ask: "What's the one question this brief should answer, and what decision does it unblock?"
- **Depth**  -  Optional, default standard. If missing I ask: "How deep should I go, a fifteen-minute scan, an hour-long dive, or a deep run? If you don't have a preference I keep going with standard depth."

## Steps
<!-- houston-workflow:v1 -->

1. **Clarify scope in one short exchange (skip if user prompt already specific).** Ask:
   - What's the brief feeding next  -  blog post, ad angles, lifecycle email, social calendar, or just for your own reading?
   - What decision must unblock?
   - Depth  -  15-min scan, 60-min dive, or deep?

2. **Read positioning doc** (own file): `context/marketing-context.md`. Ground brief in our ideal customer and category  -  generic internet research not a brief.

3. **Discover research tools at runtime.** Do NOT hardcode tool names. Run `composio search research`, `composio search web-search`, `composio search web-scrape` and pick best connected slug per step. If web-search is missing, stop and ask the user to connect a provider (Integrations tab). If only web-scrape is missing, keep going on basic HTTP fetch and flag that JS-heavy sources will be thin.

4. **Run research in layers.** Log sources as you go  -  final brief needs citations:
   1. **Landscape scan**  -  players, category terminology, top 5-10 authoritative sources.
   2. **Evidence drill**  -  fetch top sources, extract claims, quotes, data points. Cite URL + fetch timestamp per claim.
   3. **Contradiction check**  -  where sources disagree? Name both sides; don't average to mush.
   4. **Relevance filter**  -  which findings matter for OUR ideal customer / OUR positioning / decision at hand? Cut rest.

5. **Structure brief (markdown, ~500-900 words standard depth).**

   1. **The question**  -  one sentence.
   2. **TL;DR**  -  3-5 bullets user can act on today.
   3. **Key findings**  -  numbered. Each: claim, evidence (cite), implication for us.
   4. **Where sources disagree**  -  short section. Don't hide.
   5. **What we don't know**  -  explicit gaps. Mark `UNKNOWN` + kind of source that resolve.
   6. **Recommended next moves**  -  tagged by agent. Example: `[seo-content] Target cluster "{keyword}"  -  8 of 10 top-ranking pages are thin.`
   7. **Sources**  -  URL + title + fetch timestamp.

6. **Never invent.** No synthesized "it seems likely that..." statements without cited source. If research thin, say so and stop  -  bad briefs cost more than no brief.

7. **Write atomically** to `research/{topic-slug}.md`  -  `{path}.tmp` then rename. `{topic-slug}` is kebab-case of topic (e.g. `research/geo-audits-category.md`).

8. **Append to `outputs.json`.** Read-merge-write atomically:

   ```json
   {
     "id": "<uuid v4>",
     "type": "research",
     "title": "<Topic>",
     "summary": "<2-3 sentences  -  the TL;DR>",
     "path": "research/<slug>.md",
     "status": "draft",
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

9. **Summarize to user.** One paragraph: question, TL;DR one line, 1 move next, path to brief.

## Outputs

- `research/{topic-slug}.md`
- Appends to `outputs.json` with `type: "research"`.
