---
name: prepare-my-financials
description: "Draft a financial statement for the period you pick, one statement per call: `statement=pnl | balance-sheet | cash-flow | trial-balance`. I produce the statement against your journal entries, opening balances, and chart of accounts, with prior-period and prior-year comparisons and 3-5 auto-generated notes that cite specific journal entries — no invented drivers. Cash and accrual views both run on accrual books; out-of-balance and unusual-balance flags surface at the top. Drafts only — you sign, you file."
version: 1
category: Bookkeeping
featured: yes
image: ledger
x_houston:
  created_by: houston
  skill_schema: 1
---


# Prepare My Financials

Four statements, one skill, one argument. Every branch grounds the numbers in your journal entries, opening trial balance, and chart of accounts. Both cash and accrual views run on accrual books; cash-only books get a single view. Every comparison cites a source — I never invent a driver to make the page tidy.

## When to use

- `pnl`  -  "give me the P&L" / "income statement for {period}".
- `balance-sheet`  -  "draft the balance sheet as of {date}".
- `cash-flow`  -  "cash flow statement for {period}".
- `trial-balance`  -  "pull the trial balance" / "trial balance as of {date}".
- Called by `close-my-month` once per statement after accruals + revenue recognition land.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **No external connections required.** I generate statements purely from the journal entries, opening balances, and chart of accounts already on file.

This skill never blocks on a missing connection.

## Information I need

I read your bookkeeping context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Cash vs. accrual accounting** — Required. Why: accrual gets cash and accrual P&L views; cash gets just one. If missing I ask: "Are we keeping the books on cash or on accrual?"
- **A chart of accounts** — Required. Why: every statement keys off statement sections defined in the chart of accounts. If missing I ask: "Do we have a chart of accounts yet? If not, let's draft one first."
- **An opening trial balance** — Required for balance sheet, cash flow, and trial balance. Why: every account balance starts from this anchor. If missing I ask: "Do you have a closing trial balance from your prior books? Drop it as a spreadsheet or CSV."
- **A current journal-entry history** — Required. Why: every line on every statement traces back to a posted journal entry. If missing I ask: "Have we processed and closed the period yet? If not, let's run the close first so the journal entries are in place."
- **The period or as-of date** — Required. Why: tells me which journal entries to include. If missing I ask: "Which period do you want, e.g. March 2025 for a P&L, or as-of March 31 2025 for a balance sheet?"

## Steps
<!-- houston-workflow:v1 -->

1. **Read context.** Load `context/bookkeeping-context.md`, `config/context-ledger.json` (for `universal.accountingMethod` + `universal.openingBalances`), `config/chart-of-accounts.json` (LOCKED  -  statements key off `statementSection`), and `config/opening-trial-balance.json`. Parse args: `statement` (one of four) + `period` (`YYYY-MM` for P&L / cash-flow / variance; as-of date for balance-sheet / trial-balance).

2. **Load source ledger.** Read `journal-entries.json` at agent root. Filter to `status in {"ready","posted"}` (exclude `"draft"` unless user asked for draft statement). For requested period, split:
   - Period journal entries (`date` within period)  -  drive P&L + cash flow.
   - Lifetime-to-date journal entries through period-end  -  drive balance sheet + trial balance.

3. **Branch on `statement`.**

   ### `statement=pnl`
   - Group journal entry lines by chart of accounts `statementSection` under revenue / cost of goods sold / expense. Sum `credit - debit` for revenue/cost of goods sold/expense (revenue credits-positive; cost of goods sold/expense debits-positive).
   - Subtotals: Revenue → Gross Profit → Operating Income → Other Income/Expense → Net Income.
   - **Both cash and accrual views** if `accountingMethod == "accrual"` (cash view excludes accrual/prepaid/revenue-recognition/deferred-revenue journal entries by `type`). Cash-only if `accountingMethod == "cash"`.
   - **PoP comparison**: MoM (vs. prior month finalized P&L from `financials/{prior-YYYY-MM}/pnl.md` if present, else recompute on fly) AND vs. same period prior year.
   - **Notes (3-5)**  -  auto-gen on biggest variance drivers. Each note MUST cite journal entry ids or transaction set from run artifact. No invented causes.

   ### `statement=balance-sheet`
   - Classified: current assets, non-current assets, current liabilities, non-current liabilities, equity. Grouping driven by chart of accounts `statementSection`.
   - As-of balance per account = opening balance (from `config/opening-trial-balance.json`) + sum of all journal entry lines hitting that account through as-of date.
   - **Equity tie-out**: Opening equity + year to date net income (from running P&L) + paid-in-capital movements + equity-grants must equal computed equity section. Gap > $0.01 = flag.
   - **PoP comparison**: vs. prior month-end AND prior year-end.
   - **Flag unusual balances**: credit accounts receivable, debit accounts payable, negative cash, negative inventory, negative deferred revenue. Each flag names account + balance + recommended action.

   ### `statement=cash-flow`
   - **Indirect method.** Start from Net Income (P&L for period).
   - Add back non-cash: depreciation, amortization, stock-based compensation (journal entries with `type: "depreciation"` or `type: "stock-comp"`).
   - Working-capital + deferred revenue movement: `delta(accounts receivable)`, `delta(accounts payable)`, `delta(prepaid)`, `delta(deferred-revenue)`, `delta(accrued-liabilities)` between prior-period-end and this period-end.
   - Split: operating / investing / financing. Investing = fixed asset purchases + disposals. Financing = equity raises + debt + distributions.
   - **Ending cash reconciliation**: ending cash per cash-flow must equal sum-of-cash-GLs from balance sheet within $0.01. Gap = flag at top; DO NOT silently plug.

   ### `statement=trial-balance`
   - Every account with ending debit or credit balance as of requested date. Group by `statementSection`.
   - **Debits = credits within $0.01**  -  if out-of-balance, flag prominently at top with delta + short list of most-recent journal entries maybe unbalanced.
   - **Cross-tie**: trial-balance-implied P&L net income must equal P&L net income from `pnl` branch. Equity section must tie to balance sheet equity. Mismatch = flag.

4. **Write statement.** Path: `financials/{YYYY-MM}/{statement}.md` (use period-end `YYYY-MM` for `balance-sheet` / `trial-balance` too). Atomic write: `.tmp` → rename. Structure:
   - Header: statement name, entity, period / as-of date, accounting method.
   - Numbers table(s).
   - PoP comparison block (where applicable).
   - Flags block (unusual balances, out-of-balance, recon gaps).
   - Notes block (3-5 for P&L and cash flow, each citing journal entry ids or transaction sets).
   - Footer: sources (journal-entries.json hash, opening trial balance date, chart of accounts version).

5. **Append to `outputs.json`.** Read-merge-write. Row: `{id, type: "financial-statement", title: "{Statement}  -  {period}", summary: "<2-3 sentences with the headline number + biggest driver>", path: "financials/{YYYY-MM}/{statement}.md", status: "draft", domain: "reporting"}`.

6. **Never invent.** Every number ties to journal entry id or account opening balance. Every note cites evidence. Account codes stay text. If user asks for period before opening-balance date, refuse and explain.

7. **Summarize to user.** One short paragraph:
   - `pnl`: revenue, gross margin, net income, biggest MoM mover.
   - `balance-sheet`: total assets, cash, unusual flags.
   - `cash-flow`: operating cash flow, investing, financing, ending cash (with recon status).
   - `trial-balance`: in-balance Y/N, total debits = total credits, out-of-balance delta if any.
   Point user at written file. Call out any flags.

## Outputs

- `financials/{YYYY-MM}/pnl.md`
- `financials/{YYYY-MM}/balance-sheet.md`
- `financials/{YYYY-MM}/cash-flow.md`
- `financials/{YYYY-MM}/trial-balance.md`
- `outputs.json` row: `type: "financial-statement"`, `domain: "reporting"`, `status: "draft"` until user flips to `ready`.