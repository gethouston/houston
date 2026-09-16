---
name: check-my-burn-and-runway
description: "Get the founder one-pager: cash on hand, trailing 3- and 6-month net burn, runway months, a ±20% sensitivity table, and the top-3 cost drivers behind the burn. Cash balances come from QuickBooks / Xero / your bank feed where connected, the most recent statement otherwise. Every number cites a source — bank balance with timestamp, P&L line with file path, journal entry ids on the cost drivers. I surface the math and let you decide where to cut."
version: 1
category: Bookkeeping
featured: yes
image: ledger
integrations: [quickbooks, xero]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Check My Burn and Runway

Founder one-pager. Cash, burn (3-month and 6-month trailing), runway months, ±20% sensitivity, and the three biggest cost drivers behind the burn. Every number ties to a specific cash balance source or a specific P&L line — nothing invented, no advice on where to cut.

## When to use

- "what's our runway" / "how many months of cash".
- "refresh the burn report" / "rebuild the runway sheet".
- "if we grew burn 20%, how does runway change".
- Called by `close-my-month` after P&L lands; also called by `prepare-my-investor-pack` to refresh runway block.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **QuickBooks Online or Xero** (accounting) — preferred source for live cash balances per account. Optional, but the report is much fresher with this connected.
- **Bank feed** (Plaid-backed banking) — fallback / supplement when accounting isn't current. Optional.

If neither is connected I fall back to the most recent statement on file, then ask you to paste current balances. I never block, but the freshest numbers come from a live connection.

## Information I need

I read your bookkeeping context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your bank accounts and credit cards** — Required. Why: I need the list of cash accounts to sum into a current cash number. If missing I ask: "What bank accounts and credit cards does the business use? Connecting QuickBooks or your bank feed is the easiest way."
- **Current cash balances per account** — Required. Why: cash divided by burn = runway. If missing I ask: "What's the current balance in each account? If you can connect QuickBooks or the bank I'll pull it; otherwise drop the most recent statement or paste the balances."
- **Recent monthly P&Ls (last 6 months)** — Required. Why: drives trailing 3-month and 6-month net burn. If missing I ask: "Have we closed the last few months yet? If not, run the monthly close first so I have real burn numbers, otherwise I'll fall back to recomputing from journal entries."
- **A chart of accounts with cash and one-time flags** — Required. Why: tells me which accounts to treat as cash and which expenses are one-time vs. ongoing. If missing I ask: "Do we have a chart of accounts set up? If not, let's draft one first, it only takes a few minutes."

## Steps
<!-- houston-workflow:v1 -->

1. **Read context.** Load `context/bookkeeping-context.md`, `config/context-ledger.json` (need `domains.banks.accounts[]` to know which cash accounts exist), `config/chart-of-accounts.json` (identify which accounts are cash / cash-equivalents). Note today date  -  drives filename.

2. **Pull current cash balances.** For each account in `context-ledger.domains.banks.accounts[]`, source balance this priority order:
   - **Connected app**  -  QuickBooks Online / Xero / bank feed via Composio. Discover right tool at runtime (`composio search accounting` / `composio search banking`). Execute by slug; never hardcode tool names. No live connection → tell user which category to link, fall through to next source.
   - **Last statement**  -  most recent row in `statements/{last4}/` or closing balance from last `runs/{period}/run.json` that included this account.
   - **User paste**  -  ask one targeted question.

   Sum to `currentCash`. Record per-account source + timestamp so report auditable.

3. **Compute trailing net burn.** Read last 6 months P&Ls from `financials/{YYYY-MM}/pnl.md` (or recompute on fly from `journal-entries.json` if month missing):
   - **Net burn** = negative of Net Income, exclude one-time items flagged in `journal-entries.json` by `type in {"adjustment"}` and memo containing `"one-time"` / `"true-up"`. If cash-flow statement exists for period, prefer its operating + investing cash flow as burn measure.
   - **Trailing 3-month**  -  average of last 3 months.
   - **Trailing 6-month**  -  average of last 6 months.
   Record both; report show both so user see smoothing difference.

4. **Build 12-month cash history.** For each of last 12 month-ends, compute total cash (sum of cash account balances at that date from `journal-entries.json` + opening balance). Runway chart data: `cashHistory[]` = `[{monthEnd, totalCash}]`.

5. **Compute runway.**
   - `runway_3mo = currentCash / trailing_3mo_net_burn`
   - `runway_6mo = currentCash / trailing_6mo_net_burn`
   Net burn zero or negative (profitable) → display "infinite" for that column and annotate. Show both so user see sensitivity to smoothing window.

6. **Build sensitivity table.** At each of `-20%`, `-10%`, `0%`, `+10%`, `+20%` of current burn, compute runway using trailing 3-month base. Columns: `burn_change_pct`, `implied_monthly_burn`, `runway_months`.

7. **Identify top-3 cost drivers.** From latest P&L breakdown, group expense lines by `statementSection` (e.g., `operating-expenses.headcount`, `operating-expenses.hosting`, `operating-expenses.marketing`) and pick three largest by absolute dollar for trailing month. Cite each to specific P&L file path + journal entry ids if user want to drill in.

8. **Flag week-over-week runway change.** Read prior `runway/*.md` (most recent by filename date). Runway moved >10% vs prior report → prepend prominent flag to new report with delta + likely cause (burn change vs cash balance change).

9. **Write report.** Path: `runway/{YYYY-MM-DD}.md` (today date). Atomic write: `.tmp` → rename. Structure:
   - **Headline**  -  1-2 sentences: `$X cash, $Y/mo burn (3mo), {runway} months runway`.
   - **Cash balances**  -  per-account table with balance + source + asOf.
   - **Net burn**  -  3mo and 6mo trailing, one-time items excluded (list them).
   - **Runway**  -  both views (3mo and 6mo).
   - **Cash history (12mo)**  -  `cashHistory[]` in table; downstream UI can chart it.
   - **Sensitivity table**  -  five rows ±20%.
   - **Top-3 cost drivers**  -  each with dollar, % of operating expenses, source citation.
   - **Week-over-week change**  -  if applicable, flagged delta.
   - Footer: sources (P&L paths, context-ledger path, bank balance sources + timestamps).

10. **Append to `outputs.json`.** Read-merge-write. Row:
    `{id, type: "burn-runway", title: "Burn & Runway  -
    {YYYY-MM-DD}", summary: "<the headline>", path:
    "runway/{YYYY-MM-DD}.md", status: "draft", domain:
    "reporting"}`.

11. **Summarize to user.** One paragraph: cash, burn (both trailing windows), runway (both), biggest cost driver, any week-over-week flag. Point at written file. Never give "advice" on cuts  -  surface math, let founder decide.

## Outputs

- `runway/{YYYY-MM-DD}.md`
- `outputs.json` row: `type: "burn-runway"`, `domain: "reporting"`, `status: "draft"` until user signs off.