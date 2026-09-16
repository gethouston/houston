---
name: check-my-sales-tax-nexus
description: "See where you owe sales tax. I total revenue and transaction counts per US state from Stripe (or QuickBooks / Xero / invoices as fallback), compare each state's totals against its economic-nexus threshold for the quarter and trailing 12 months, pinpoint the month each crossed state was triggered, and flag physical-nexus states (W-2 employees, offices, inventory / FBA). I rank exposure highest-dollar first and call out the closest pre-crossing states as early warnings. I prep — you register and remit through Avalara, TaxJar, or the state portal directly."
version: 1
category: Bookkeeping
featured: no
image: ledger
integrations: [stripe, quickbooks, xero]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Check My Sales Tax Nexus

State-by-state economic-nexus check. I total revenue and transactions per US state for the period, compare against each state's threshold, pinpoint the crossing month, and flag physical-nexus triggers (employees, offices, inventory) regardless of revenue. Exposure is ranked highest-dollar first; the three closest pre-crossing states show up as early warnings. I never register and I never remit.

## When to use

- "where do we owe sales tax" / "nexus check" / "sales-tax exposure by state".
- Quarterly  -  end of fiscal quarter.
- Company cross round-number revenue mark ($500K, $1M, $5M) or add employees in new state.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Stripe** (billing) — required to pull charges with billing / shipping state for revenue-by-state aggregation. Required if Stripe is your primary contract source.
- **QuickBooks Online or Xero** (accounting) — pulls invoice / customer state tags as a fallback or supplement to Stripe. Optional.

If none of the required categories are connected I stop and ask you to connect Stripe first, since most startups invoice through it.

## Information I need

I read your bookkeeping context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your company's home state** — Required. Why: physical-nexus baseline; you owe sales tax there regardless of revenue. If missing I ask: "What state is the company headquartered or incorporated in?"
- **How you bill customers and where contracts live** — Required. Why: drives the source I use for revenue-by-state. If missing I ask: "How do you invoice customers, mostly through Stripe, through QuickBooks or Xero, or somewhere else?"
- **States you already collect or file sales tax in** — Optional. Why: lets me mark already-registered states as "no action" instead of "new exposure." If missing I ask: "Are you already registered to collect sales tax anywhere? If you don't have it I keep going and flag every crossing as new."
- **Where your employees physically work** — Optional. Why: any W-2 employee in a state creates physical nexus regardless of revenue. If missing I ask: "Do you have employees working in states besides the headquarters state? If you don't have it I note it as TBD and call out physical-nexus checks for the user to confirm."

## Steps
<!-- houston-workflow:v1 -->

1. **Read context.** Load `context/bookkeeping-context.md`, `config/context-ledger.json`, `config/chart-of-accounts.json`. Required ledger: `universal.company.state`, `domains.revenue.contractSource`, `domains.tax.stateFilingFootprint`. SaaS taxability vary by state  -  compute exposure regardless of taxability posture.

2. **Determine period.** Use user `{YYYY-QN}` if given; else most recent completed fiscal quarter. Also report trailing 12-month rolling view (most state thresholds measure this).

3. **Pull revenue by ship-to state.** Source priority:
   a. **Stripe via Composio.** `composio search billing` → discover Stripe slug → pull charges in period with customer billing / shipping state. SaaS use billing address; shipped goods use ship-to. Fall back to card country + postal code if address missing.
   b. **Invoices (CSV / paste).** User provides invoice-level data with state, amount, date, customer id.
   c. **Accounting system via Composio.** QuickBooks Online / Xero customer list with state tags.
   None available → stop, ask for source. Never invent state attributions.

4. **Aggregate per state.** Sum revenue; count distinct transactions (thresholds use "separate transactions"  -  multi-line invoice = one; monthly subscription = 12 per year per customer).

5. **Compare against economic-nexus thresholds.** Use reference table (re-check current DOR guidance if cached date on ledger > 12 months old):

   | State | Threshold (OR unless noted) |
   |---|---|
   | CA | $500K revenue (no transaction count) |
   | NY | $500K revenue AND 100 transactions (both) |
   | TX | $500K revenue (no transaction count) |
   | FL | $100K revenue (no transaction count) |
   | IL | $100K OR 200 transactions |
   | MA | $100K (no transaction count) |
   | WA | $100K (no transaction count) |
   | CO | $100K (no transaction count) |
   | GA | $100K OR 200 transactions |
   | NC | $100K OR 200 transactions |
   | PA | $100K (no transaction count) |
   | OH | $100K OR 200 transactions |
   | VA | $100K OR 200 transactions |
   | MI | $100K OR 200 transactions |
   | NJ | $100K OR 200 transactions |
   | Default (all others) | $100K OR 200 transactions |

   "OR" states: cross either = nexus. "AND" states (NY): must cross both. Most measure over trailing 12 months or prior calendar year  -  note which per row.

6. **Crossing date.** For each crossed state, walk cumulative revenue + transactions month by month. Pinpoint crossing month. Most states give 30–60 day grace period to register.

7. **Physical-nexus flags.** Regardless of economic threshold:
   - Employees working in state (per `domains.payroll` / HR system  -  ask if not captured). Any W-2 employee = physical nexus.
   - Offices / leased space.
   - Inventory (including FBA warehouses).
   - Contractors: generally do NOT create nexus (1099s don't count), but some states (e.g., TX) take aggressive positions  -  flag, don't auto-conclude.
   Physical nexus require registration regardless of revenue.

8. **Rank by exposure.** Sort crossed states by cumulative revenue (descending). Each row: state; revenue in period + rolling 12m; transactions in period + rolling 12m; threshold applied; date crossed; physical-nexus flag; cumulative exposure; next action ("Register via Avalara / TaxJar / direct DOR portal" / "Engage SALT advisor" / "Already registered per `stateFilingFootprint`" / "Monitor  -  below").

9. **Write `compliance/sales-tax/{YYYY-QN}.md`.** Atomic write. Structure:
   - **Summary**  -  states crossed, physical-nexus count, total exposed revenue, already-registered vs. new crossings.
   - **Crossed states**  -  table ranked by exposure.
   - **Physical-nexus-only**  -  states with physical presence but below economic threshold.
   - **Not crossed**  -  one-liner showing 3 closest to threshold (early warning).
   - **Taxability note**  -  remind user SaaS taxability varies by state; crossing threshold ≠ every sale taxable. Need DOR guidance on specific product  -  judgment call for SALT advisor.
   - **Filing note**  -  "Prep only. Registration via Avalara / TaxJar / direct state portals. Remittance / filing is on you."

10. **Append to `outputs.json`.** Row: `{type: "sales-tax-nexus", title: "Sales-tax nexus {YYYY-QN}", summary, path, status: "draft", domain: "compliance"}`. Read-merge-write.

11. **Summarize to user.** One paragraph: # states newly crossed, total exposure, top-3 by risk, physical-nexus flags, next move per crossed state. Never register, never remit.

## Outputs

- `compliance/sales-tax/{YYYY-QN}.md` (indexed as `sales-tax-nexus`)