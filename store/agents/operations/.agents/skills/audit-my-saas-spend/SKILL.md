---
name: audit-my-saas-spend
description: "See your real annualized SaaS spend in one place, including the subscriptions you forgot about. I aggregate everything from your billing provider, your inbox receipts, and your contract library, flag duplicates and unused tools, and surface the top three cancel candidates with rationale. Most founders are surprised by the headline number the first time."
version: 1
category: Operations
featured: no
image: clipboard
integrations: [gmail, outlook, stripe]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Audit My SaaS Spend

Surprise-reveal skill. Most solo founders not know annualized SaaS spend. Surface in one file.

## When to use

- "audit my SaaS spend".
- "what am I paying for".
- "find the subscriptions I forgot about".
- "how much are we spending on tools".

## Connections I need

I run external work through Composio. Before this skill runs I check the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Billing** (Stripe)  -  Required. Pulls recurring charges so I can see the real subscription list, not just what you remember.
- **Inbox** (Gmail, Outlook)  -  Required. Catches receipts and renewal emails for tools that aren't on your card.
- **Files** (Google Drive)  -  Optional. Helps me find executed contracts so I can match them to charges.

If neither billing nor inbox is connected I stop and ask you to connect your billing first.

## Information I need

I read your operations context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Vendor posture**  -  Required. Why I need it: tells me how aggressive to be flagging duplicates and cancel candidates. If missing I ask: "How do you usually think about vendors  -  keep things lean and cancel fast, or stay with what works?"
- **Known vendor list**  -  Optional. Why I need it: anything I find outside this list is a forgotten subscription. If you don't have it I keep going with TBD and treat everything I find as new.
- **Prior audit**  -  Optional. Why I need it: lets me flag price drift since last time. If you don't have it I skip the price-drift section.

## Steps
<!-- houston-workflow:v1 -->

1. **Read `context/operations-context.md`**  -  stage + vendor posture anchor severity thresholds. If missing: stop, ask for `set-up-my-ops-info`.

2. **Read `config/procurement.json`**  -  `knownVendors` = known list; anything NOT on list found during audit = potential forgotten-subscription.

3. **Aggregate sources.**

   - **Source A  -  contract library (`contracts/`).** Every parsed contract yields subscription. Pull: vendor, amount if known, billing frequency, renewal date.
   - **Source B  -  connected billing.** `composio search billing` → list-subscriptions / list-charges. Pull recurring charges from last 12 months. Normalize to annualized amount.
   - **Source C  -  inbox receipts.** `composio search inbox` → search for `receipt OR "subscription renewed" OR "payment confirmed" OR invoice` in last 90 days. Extract sender domain + amount + date. Catches subs not on card.

4. **Deduplicate across sources.** Match on (normalized vendor name) + (amount ± 5%) + (billing frequency). Same sub in two sources → merge, note all sources.

5. **Annualize every entry.** Monthly × 12, quarterly × 4, annual × 1.

6. **Detect patterns.**

   - **Duplicates / overlaps.** Two project-management tools? Three password managers? Two note apps? Flag with 1-line "consider consolidating to {one}."
   - **Unused tools.** For each subscription, attempt usage check: `composio search {category}` → provider have last-login or usage API? If no, fallback to "last receipt date" vs. "last activity in connected inbox" as proxy. Flag anything with no proxy-activity in 60+ days.
   - **Forgotten subs.** Any found in Source B or C NOT in `knownVendors` or `contracts/` → call out explicitly.
   - **Price drift.** If prior audit exists at `spend/` and vendor's annualized amount jumped >15%, flag.

7. **Produce output** (save to `spend/{YYYY-MM-DD}-audit.md`):

   - **Headline**  -  total annualized spend, count of subscriptions.
   - **Spend table**  -  ordered by annualized amount descending. Columns: Vendor | Category | Annualized | Billing | Next renewal | Last activity | Flag.
   - **Duplicates / overlaps**  -  grouped by category.
   - **Unused (no activity 60+ days)**  -  list with evidence.
   - **Forgotten subscriptions**  -  stuff not in `config/procurement.json` or `contracts/`.
   - **Price drift**  -  deltas vs prior audit.
   - **Top 3 cancel candidates**  -  3 highest-leverage cancels (high annualized + low usage + no auto-renew trap). Each with 3-line rationale.

8. **Atomic writes**  -  `*.tmp` → rename.

9. **Append to `outputs.json`** with `type: "spend-audit"`, status "ready".

10. **Suggest next moves.**
    - For each top cancel candidate: "ready to draft cancel email? Use `draft-a-message type=vendor` with cancel sub-type."
    - If forgotten subs exist and contracts missing: "run `read-a-contract` on {vendor} once you've located contract."

## Outputs

- `spend/{YYYY-MM-DD}-audit.md`
- Appends to `outputs.json` with `type: "spend-audit"`.

## What I never do

- **Cancel a subscription.** I identify candidates; founder decides; `draft-a-message type=vendor` writes draft; founder sends.
- **Move money, modify billing details, or change payment methods.** Read-only on billing.
- **Treat billing data as system-of-record.** Sources disagree → surface disagreement  -  don't pick winner silently.