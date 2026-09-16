---
name: find-my-docs-gaps
description: "Look at what your customers keep asking about and figure out where your help center is falling short. Ranks the gaps by how many people hit them and how valuable those customers are, gives you the top three with the actual tickets behind each one, and offers to draft the articles right there."
version: 1
category: Support
featured: no
image: headphone
x_houston:
  created_by: houston
  skill_schema: 1
---


# Find My Docs Gaps

## When to use

- Ask: "what should I write docs for?", "what gaps do we have?", "what's missing from help center?".
- Weekly cadence  -  usually paired with or before `review-my-support scope=help-center-digest`.
- After `flag-a-signal signal=repeat-question` find new clusters worth review.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Knowledge base** (Notion / Google Docs)  -  cross-check your published articles so I don't flag a gap you've already filled. Optional if your articles live locally.
- **CRM** (HubSpot / Attio / Salesforce)  -  weight gaps by customer plan tier and monthly revenue. Optional, falls back to equal weight.

I keep going if neither is connected, but I'll tell you the ranking is rougher without them.

## Information I need

I read your support context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Help-center platform**  -  Required. Why I need it: I check existing coverage before ranking a cluster as a real gap. If missing I ask: "Where do your help articles live today  -  Notion, Intercom, a docs site, or nowhere yet?"
- **Plan tiers**  -  Optional. Why I need it: gaps hitting paying customers rank higher than free-tier hits. If you don't have it I keep going with equal weight per ticket.

## Steps
<!-- houston-workflow:v1 -->

1. Read `patterns.json` (clusters of repeat questions) and `articles/` (existing KB). Filter patterns without matching article.
2. List empty → run `flag-a-signal signal=repeat-question` first (or tell me just ran, nothing yet).
3. Rank each open gap by impact score:
   - `occurrenceCount`  -  primary signal (how often asked)
   - **Customer value**  -  each `sourceTicketId`, lookup customer in `customers.json`, weight by plan tier / monthly revenue if present (fallback: equal weight)
   - **Freshness**  -  recent occurrences beat stale; heavy penalize gaps with no hits in last 14 days
4. Present top 3 gaps in chat:
   ```
   1. "How do I reset my API key?"  -  7 occurrences, 3 paying customers, latest 2 days ago
      Source tickets: t_abc, t_def, t_ghi
   2. ...
   3. ...
   ```
5. Ask: "Want me to draft articles for any of these? Reply with the numbers (e.g. '1 and 3')."
6. Each number picked, pick representative source ticket (most recent, or clearest resolution) and chain to `write-an-article type=from-ticket`.
7. Write ranking snapshot to `gaps/{YYYY-MM-DD}.md`, append entry to `outputs.json` with `type: "docs-gap"`, `domain: "help-center"`.
8. Gap promoted to article → refresh `patterns.json` entry with `relatedArticleSlug` so won't re-surface.

## Outputs

- `gaps/{YYYY-MM-DD}.md` (ranked list of top 3)
- Updates `patterns.json` (relatedArticleSlug on promotion)
- May chain to `write-an-article type=from-ticket` (one call per accepted gap)
- Appends to `outputs.json` with `type: "docs-gap"`, `domain: "help-center"`.
