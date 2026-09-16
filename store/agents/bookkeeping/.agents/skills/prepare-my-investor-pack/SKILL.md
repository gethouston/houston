---
name: prepare-my-investor-pack
description: "Assemble a board-ready financial pack from the latest close: a one-page exec summary (cash, burn, runway, monthly revenue / annual revenue, gross margin, headcount, top-3 variance) followed by P&L, balance sheet, cash flow, SaaS KPIs (monthly revenue waterfall, NRR, gross margin, CAC payback), cohort retention if you have ≥ 6 cohorts, and runway sensitivity. `mode=saas-metrics` skips the full pack and refreshes just monthly revenue / annual revenue / gross margin / NRR. Optional Google Docs mirror so the board can comment. Drafts only — I never send."
version: 1
category: Bookkeeping
featured: no
image: ledger
integrations: [googledocs]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Prepare My Investor Pack

Board pack from your latest close. Exec summary up top — cash, burn, runway, monthly revenue / annual revenue, gross margin, headcount, top-3 variance drivers — then full statements, SaaS KPIs, cohort retention, and runway sensitivity below. Optional Google Docs mirror so your board can comment in place. Drafts only — I never send.

## When to use

- "draft the board financials pack" / "prep investor update financials" / "build the Q{N} investor pack".
- `mode=saas-metrics`  -  "refresh monthly revenue / annual revenue" / "what's our NRR this month"  -  skip full pack, write metrics-only file.
- After `close-my-month` finishes quarter-end month, or any time user wants fresh pack between closes.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Google Docs** (docs) — optional, lets me mirror the pack to a Google Doc your board can comment on. If not connected I keep it as a markdown file.

This skill assembles entirely from your existing closed months, runway reports, and revenue recognition schedules. No connection blocks the run.

## Information I need

I read your bookkeeping context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **A finished close for the period** — Required. Why: the pack copies P&L, balance sheet, and cash flow straight from the close. If missing I ask: "Have we closed the books for the latest month yet? If not, let's run the close first."
- **A current burn and runway report** — Required. Why: the pack includes cash, burn, and runway sensitivity from the runway report. If missing I ask: "Do you want me to refresh the runway report first? It only takes a minute."
- **Your revenue model** — Required. Why: SaaS pack includes monthly revenue / annual revenue / NRR / cohort retention; non-SaaS skips those sections. If missing I ask: "How does the business make money, recurring subscriptions, usage-based, services, or a mix?"
- **The KPIs your investors care about** — Optional. Why: lets me anchor the exec summary to numbers your board already tracks. If you don't have it I default to cash, burn, runway, monthly revenue / annual revenue, and gross margin.
- **Contract data spanning at least 13 months** — Optional. Why: needed for trailing-twelve-month NRR and cohort retention. If you don't have it I skip those sections and note that they'll show up once you have enough history.

## Steps
<!-- houston-workflow:v1 -->

1. **Read context.** Load `context/bookkeeping-context.md`, `config/context-ledger.json`, `config/chart-of-accounts.json`. Required ledger fields: `universal.company`, `universal.accountingMethod`, `domains.revenue.model`, `domains.investors.anchorKpis`. Missing field → one targeted question with modality hint (connected app > file > URL > paste), write atomically before continuing.

2. **Locate latest close.** List `closes/*/package.md`, pick most recent `YYYY-MM`. If latest close `draft` in `outputs.json`, warn user, ask: proceed on draft or wait. Record close period as pack's as-of date.

3. **Locate latest runway report.** List `runway/*.md`, pick most recent by filename date. Read cash balance, net burn (3- and 6-month), runway months, top-3 cost-driver sensitivities.

4. **Read revenue recognition schedules.** SaaS/subscription models → load every `revrec/{customer-slug}/{contract-slug}.json`. Current monthly revenue = sum active monthly recognition per contract. Annual revenue = monthly revenue * 12.

5. **Compute monthly revenue waterfall (if SaaS).** Trailing 12 months of revenue recognition schedules:
   - **New monthly revenue**  -  contracts whose first recognition month in period.
   - **Expansion monthly revenue**  -  increases on existing customer contracts (upsell, seat expansion).
   - **Contraction monthly revenue**  -  decreases on existing customer contracts (downgrade, seat reduction).
   - **Churn monthly revenue**  -  contracts whose recognition stopped in period (customer gone).
   - Net new monthly revenue = New + Expansion − Contraction − Churn.
   Cite every delta with `revrec/{customer}/{contract}.json` path + contract id.

6. **Compute NRR over trailing 12-month cohort.** Cohort = customers active 12 months ago. NRR = (current monthly revenue from cohort) / (monthly revenue from cohort 12 months ago). Report as percent. Only compute if contract data spans ≥ 13 months.

7. **Compute gross margin.** GM% = (Revenue − cost of goods sold) / Revenue, from latest close P&L. Pull revenue + cost of goods sold lines straight from `closes/{YYYY-MM}/package.md`.

8. **Compute CAC payback (optional).** If marketing + Sales & Marketing spend identifiable on P&L AND new monthly revenue computed: CAC = Sales & Marketing spend / new logos; CAC payback months = CAC / (new monthly revenue * GM%). Report only if both inputs real numbers  -  else mark `TBD  -  needs marketing-spend attribution`.

9. **Build cohort retention table (if contract data).** Rows = cohort month (first contract month); columns = months since acquisition (M0..M12+); cells = retained monthly revenue / cohort M0 monthly revenue. One row per cohort month. Include only if ≥ 6 cohorts exist.

10. **Assemble pack** at `investor-financials/{yyyy-qq}.md`. Quarter slug: `2026-q1`, `2026-q2`, etc.  -  derive from close period's month. Structure:
    1. **Exec summary (one page)**  -  cash balance, 3-month avg net burn, runway months, monthly revenue, annual revenue, GM%, headcount, top-3 variance drivers vs. prior quarter.
    2. **P&L**  -  copy from close.
    3. **Balance sheet**  -  copy from close.
    4. **Cash flow**  -  copy from close.
    5. **SaaS KPIs (if applicable)**  -  monthly revenue waterfall, annual revenue, NRR, GM%, CAC payback.
    6. **Cohort retention table** (if ≥ 6 cohorts).
    7. **Runway + sensitivity**  -  copy from latest runway report.
    8. **Judgment-call notes**  -  any position needing user confirmation (churn definition edge cases, CAC scope).

    Every KPI cites source (close path + line, revenue recognition paths, runway path). No invented numbers.

11. **Optional Google Docs mirror.** If `composio search docs` returns connected Docs slug, mirror pack to new Doc, include URL at top of `.md`. No connection → skip silently.

12. **`mode=saas-metrics` branch.** Skip steps 3, 9, 10 full assembly. Write `investor-financials/metrics-{YYYY-MM}.md` with only: monthly revenue (current + waterfall), annual revenue, GM%, NRR. No Docs mirror.

13. **Atomic write.** `.tmp` + rename onto target path.

14. **Append to `outputs.json`.** Row: `{type: "investor-financials", title: "Investor pack {yyyy-qq}" | "SaaS metrics {YYYY-MM}", summary, path, status: "draft", domain: "reporting"}`. Read-merge-write.

15. **Summarize to user.** One paragraph: what assembled, which close period basis, headline numbers (cash, burn, runway, annual revenue, GM%), any `TBD` items, next move (user reviews; never send). Never post, never mail.

## Outputs

- `investor-financials/{yyyy-qq}.md` (full pack, indexed in `outputs.json` as `investor-financials`)
- `investor-financials/metrics-{YYYY-MM}.md` (sub-mode only, same type in `outputs.json`)
- Optional Google Docs mirror (URL captured in `.md` header)