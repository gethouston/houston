---
name: find-my-expansions
description: "Scan your GREEN customers for expansion signals - usage spikes past tier thresholds, team-size growth, feature-request patterns, new-product adoption - and rank upsell, cross-sell, add-on, and seat-expansion opportunities by annual revenue upside over effort to close. Every row cites the signal so you know why I surfaced it."
version: 1
category: Sales
featured: no
image: handshake
integrations: [linkedin]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Find My Expansions

## When to use

- "any expansion opportunities in my book right now".
- "who's ripe for upsell / cross-sell".
- Scheduled: monthly expansion sweep.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Billing**  -  pull seat counts, tier, and usage against tier thresholds. Required.
- **CRM**  -  identify GREEN customers and feature-request patterns. Required.
- **Social**  -  read team-size growth on LinkedIn. Optional.

If billing or CRM aren't connected I stop and ask you to connect Stripe and your CRM first  -  expansion is grounded in real usage and account state.

## Information I need

I read your sales context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your sales playbook**  -  Required. Why I need it: pricing stance and SKU list drive what an upsell or cross-sell even looks like. If missing I ask: "I don't have your playbook yet  -  want me to draft it now?"
- **Connected billing**  -  Required. Why I need it: seat and usage data ground every expansion candidate. If missing I ask: "Connect Stripe so I can read seat counts, tiers, and usage."
- **Connected CRM**  -  Required. Why I need it: I read which customers are GREEN and pull recent feature-request patterns. If missing I ask: "Connect your CRM (HubSpot, Salesforce, Attio, Pipedrive, or Close) so I can read your customer book."
- **Product usage source**  -  Optional. Why I need it: usage spikes are the strongest expansion signal. If you don't have it I keep going with TBD on that signal and lean on seat and team-growth signals instead.

## Workflow
<!-- houston-workflow:v1 -->

1. **Read playbook.** `context/sales-context.md` for pricing stance + SKU list.

2. **Read `customers.json`.** Filter to `health: "GREEN"` only.

3. **Per GREEN customer, check signals:**
   - **Usage spikes**  -  past current tier threshold (query product-analytics).
   - **Team-size growth**  -  new seats, LinkedIn headcount growth (query CRM + LinkedIn if connected).
   - **Feature requests**  -  from tickets mapping to existing SKU (query support).
   - **New-product adoption**  -  % using newest feature / SKU.

4. **Score candidate.** Annual revenue impact (low / med / high) × effort-to-close (low / med / high). Rank by impact/effort ratio.

5. **High-signal candidates, write per-customer brief:** `customers/{slug}/expansion-{YYYY-MM-DD}.md`  -  cited signal, proposed SKU / seat / tier, estimated annual revenue, effort-to-close, one-line pitch agent would use.

6. **Append to `expansion.json`:**

   ```ts
   {
     id, slug, customerSlug,
     type: "upsell" | "cross-sell" | "add-on" | "seat-expansion",
     estAnnualRevenue, effort: "low"|"med"|"high",
     signal: "<cited signal>",
     status: "surfaced",
     createdAt, updatedAt
   }
   ```

7. **Update `customers.json`**  -  increment `openExpansions`.

8. **Append to `outputs.json`** with `type: "expansion"`.

9. **Summarize.** Top 3 opportunities (customer · type · estimated annual revenue). Suggest handoff: "Run `write-a-proposal` on top one."

## Outputs

- `customers/{slug}/expansion-{YYYY-MM-DD}.md` per candidate.
- Appends to `expansion.json`.
- Appends to `outputs.json`.