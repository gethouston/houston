---
name: schedule-my-revenue
description: "Spread a customer contract into a clean ASC 606 recognition schedule, one artifact per contract organized by customer. I handle the common startup patterns — annual upfront with monthly ratable, usage-based with a floor, implementation-fee deferral, contract modifications (prospective vs. cumulative catch-up) — and I flag the judgment calls (variable consideration, significant financing, non-cash) with options and dollar impact. I draft and surface; I never decide for you and I never post."
version: 1
category: Bookkeeping
featured: no
image: ledger
integrations: [hubspot, stripe]
x_houston:
  created_by: houston
  skill_schema: 1
---

# Schedule My Revenue

Turn a signed contract into a month-by-month ASC 606 recognition schedule. One JSON artifact per contract, grouped by customer. Common patterns are baked in; the genuinely judgment-heavy stuff (variable consideration, significant financing, non-cash) gets flagged so you can decide. I summarize options, I never decide, and I never post.

## When to use

- "build the revenue recognition schedule for {customer}" / "spread this contract".
- "build the ASC 606 schedule" / "ASC 606 recognition for this contract"  -  same flow, founder-side phrasing.
- "the customer renewed / upgraded / added a SKU  -  update revenue recognition".
- "we invoiced this annually; recognize it monthly".
- Called by `close-my-month` as part of revenue recognition pass, once per active contract.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Stripe** (billing) — preferred source for subscription contracts, line items, and billing cadence. Required if Stripe is your contract source.
- **HubSpot** (CRM) — alternate / supplement source for signed contracts and SKU-level pricing. Optional.

If neither is connected I fall back to a dropped contract file (PDF, DOCX, CSV) or pasted summary. If you have nothing to share I stop and ask you to connect Stripe or drop the contract.

## Information I need

I read your bookkeeping context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **The contract itself** — Required. Why: I can't build a recognition schedule without effective date, end date, line items, and pricing. If missing I ask: "Can you share the signed contract? Connecting Stripe or HubSpot is easiest, otherwise drop the PDF or paste the line items."
- **Your revenue model and ASC 606 posture** — Required. Why: subscription vs. usage vs. services changes how each performance obligation is recognized. If missing I ask: "How does the business make money, subscriptions, usage-based, services, or a mix? And are you trying to follow ASC 606 strictly or staying on cash?"
- **A chart of accounts with deferred revenue and revenue lines** — Required. Why: I draft the journal entry stubs against real account codes, never invented ones. If missing I ask: "Do we have a chart of accounts yet with a deferred revenue line? If not, let's draft one first."
- **Whether this is a new contract or a modification** — Optional. Why: changes whether I treat it as a fresh schedule or a prospective / cumulative-catch-up modification. If missing I ask: "Is this a brand-new customer contract or an upsell or change to an existing one? If you don't have it I assume new and flag it for you to confirm."

## Steps
<!-- houston-workflow:v1 -->

1. **Read context.** Load `context/bookkeeping-context.md`, `config/context-ledger.json` (needs `domains.revenue`  -  model + ASC 606 posture + contract source), `config/chart-of-accounts.json` (needs deferred-revenue + revenue account codes). If `domains.revenue` missing, ask ONE targeted question with modality hint (connected app > file > URL > paste), persist, continue.

2. **Load contract.** Source ranking: connected app (Stripe / HubSpot via Composio  -  discover slugs at runtime with `composio search billing` / `composio search crm`) > dropped file (CSV / PDF / DOCX) > URL > paste. Extract:
   - `customer`  -  name + internal id if available.
   - `contractId`  -  vendor-side id if available, else slug.
   - `effectiveDate`, `endDate`.
   - Line items (SKU, description, quantity, unit price, billing cadence, start/end dates, is-usage-based flag, floor if any).
   - Payment terms (upfront / monthly / net-30).
   - Non-cash or variable consideration language.

3. **Identify performance obligations.** Per line item, decide distinct PO or combine:
   - Standalone SaaS subscription → one PO per subscription term.
   - Implementation / onboarding fee → distinct PO only if service separately useful; else combine with subscription, amortize over contract life. Flag either way.
   - Usage-based overage → variable consideration on same PO as underlying subscription.
   - Professional services with defined deliverables → one PO per deliverable.

   Output array `performanceObligations[]`:
   `{id, description, standaloneSellingPrice, recognitionPattern:
   "ratable" | "point-in-time" | "usage" | "milestone",
   startDate, endDate}`.

4. **Compute transaction price.** Sum fixed consideration across all POs. Add floor (if any) for usage-based items. Flag  -  do NOT auto-include  -  any:
   - **Variable consideration** (volume tiers, performance bonuses, rebates). Summarize options (expected value vs. most-likely amount), stop for user confirmation.
   - **Significant financing component** (payment > 12 months from transfer of control). Summarize, stop.
   - **Non-cash consideration** (equity, tokens, barter). Summarize, stop.

   Never invent treatment. Flagged items land in `judgmentCalls[]` array with options + recommendation.

5. **Allocate transaction price across POs.** Use standalone selling price (SSP) as default allocation base. If SSP for implementation fee not observable, use residual approach + flag. Produce `allocation[]`  -  `{poId, allocatedAmount, method}`.

6. **Build monthly recognition schedule.** Per PO, apply recognition pattern:
   - **Ratable** (annual upfront, monthly ratable): `allocatedAmount /
     months_in_term`, each month from `startDate` to `endDate`.
   - **Usage-based with floor**: recognize floor ratably across term; recognize usage above floor in month earned (leave placeholder rows  -  user plugs actuals via close).
   - **Implementation-fee deferral**: amortize `allocatedAmount /
     months_in_contract_life`, straight-line across full term.
   - **Point-in-time / milestone**: single row on recognition date.

   Emit `schedule[]`: `{period, poId, amount, cumulativeRecognized,
   method}`. `cumulativeRecognized` running per PO + total.

7. **Handle contract modifications.** If user flags as modification of prior contract (upsell, downsell, term extension):
   - **Prospective** (adds distinct goods/services at SSP): treat as new contract; start new schedule from modification date.
   - **Cumulative catch-up** (changes price of existing POs, no new distinct goods): recompute revised total, re-allocate, post catch-up adjustment in modification period.

   Treatment decision = judgment call  -  summarize both options with dollar impact, stop for user confirmation.

8. **Draft supporting journal entry stubs.** Per row in `schedule[]`, generate draft journal entry outline (Dr deferred revenue / Cr revenue, or Dr contract asset / Cr revenue as appropriate). Do NOT write to `journal-entries.json` here  -  user runs `draft-a-journal-entry type=revrec` to persist. Include in output JSON so downstream journal entry skill has ready input.

9. **Write artifact.** Slugify `customer` + `contractId`. Path: `revrec/{customer-slug}/{contract-slug}.json`. Atomic write: `.tmp` → rename. Full schema:
   ```jsonc
   {
     "id": "<uuid>",
     "createdAt": "...",
     "updatedAt": "...",
     "customer": { "name": "...", "slug": "..." },
     "contract": { "id": "...", "slug": "...", "effectiveDate": "...", "endDate": "..." },
     "performanceObligations": [ /* step 3 */ ],
     "transactionPrice": 120000.00,
     "allocation": [ /* step 5 */ ],
     "schedule": [ /* step 6 */ ],
     "judgmentCalls": [ /* step 4 + step 7 */ ],
     "jeStubs": [ /* step 8 */ ],
     "status": "draft"
   }
   ```

10. **Append to `outputs.json`.** Read-merge-write. One row per contract artifact: `{id, type: "revrec-schedule", title: "Revenue Recognition
     -  {customer} / {contract}", summary: "<2-3 sentences on
    transaction price, term, and any judgment calls>", path,
    status: "draft", domain: "close"}`.

11. **Summarize to user.** One paragraph: transaction price, term, monthly recognition amount, and  -  most important  -  any `judgmentCalls` blocking finalization. Per judgment call, list options + recommended treatment + dollar impact, wait for confirmation before flipping `status: "ready"`.

## Outputs

- `revrec/{customer-slug}/{contract-slug}.json` (per-contract schedule)
- `outputs.json` row: `type: "revrec-schedule"`, `domain: "close"`, `status: "draft"` until user signs off on every judgment call.