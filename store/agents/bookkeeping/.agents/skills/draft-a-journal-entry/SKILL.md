---
name: prep-journal-entry
description: "Use when the user says 'book the accrual journal entry' / 'draft the depreciation journal entry for Q1' / 'post the prepaid amortization' / 'revenue recognition this period' / 'stock-comp journal entry' / 'reclass this expense'  -  I draft a balanced double-entry journal entry that branches on `type`: `accrual` | `prepaid` | `payroll` | `revrec` | `depreciation` | `stock-comp` | `adjustment` | `reclass`. Every journal entry is validated balanced to 1 cent, every account code is validated against `config/chart-of-accounts.json`, and the entry is written at `status: \"draft\"`. Sub-mode `type=accrual mode=reversing` auto-reverses every active accrual flagged `reversing=true`. Draft-only  -  I never post to QuickBooks Online / Xero."
version: 1
category: Bookkeeping
featured: no
image: ledger
integrations: [quickbooks, xero, linear]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Prep Journal Entry

One balanced journal entry from type-specific template. Invariants enforced every write: debits equal credits within 1 cent, every `glCode` exists in locked chart of accounts, `status: "draft"` (never `posted` without explicit user confirm), `reversing: true` requires `reversesEntryId` + opposite sign convention.

Draft-only: write markdown + index row; user/accountant post to QuickBooks Online / Xero.

## When to use

- "book the accrual journal entry" / "draft the depreciation journal entry for Q1" / "post the prepaid amortization".
- "revenue recognition journal entry for March" / "stock-comp journal entry for the period".
- "reclass this $X from General & Admin to R&D" / "book this adjustment".
- "book the payroll journal entry from Gusto / Rippling / Justworks"  -  use `type=payroll` with the pay-period summary.
- "post the reversing entries for this period" / "draft this period's reversals"  -  use `type=accrual mode=reversing` to auto-reverse every active accrual flagged `reversing=true`.
- Called by `run-monthly-close` for every due standard journal entry in close loop.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Payroll provider** (Gusto, Rippling, Justworks, Deel, ADP) — required for `type=payroll` if you want me to pull the pay-period summary directly. Otherwise you paste the summary.
- **QuickBooks Online or Xero** (accounting) — optional, used to cross-check account codes for `type=adjustment` or `type=reclass`.
- **Linear** — optional, only used to look up project context if you want a memo grounded in a ticket.

If `type=payroll` and no payroll connection exists I stop and ask you to connect Gusto / Rippling / Justworks, or paste the pay-period summary.

## Information I need

I read your bookkeeping context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **A chart of accounts** — Required. Why: every line on the journal entry has to reference a real account code. If missing I ask: "Do we have a chart of accounts yet? If not, let's draft one first."
- **The entry type and period** — Required. Why: tells me which template to use (accrual, prepaid, payroll, revenue recognition, depreciation, stock-comp, adjustment, reclass) and which month it lands in. If missing I ask: "What kind of entry are we booking, and for which month?"
- **A fixed-asset list, for `type=depreciation`** — Required for that type. Why: I compute monthly depreciation from cost, salvage, and useful life per asset. If missing I ask: "Do you have a list of capitalized fixed assets with cost, in-service date, and useful life? Drop the spreadsheet or paste it."
- **A 409A valuation and vesting schedule, for `type=stock-comp`** — Required for that type. Why: drives the linear ASC 718 expense after cliff. If missing I ask: "Do you have a current 409A valuation and the vesting schedule for outstanding grants? Drop them or share what you have."
- **A pay-period summary, for `type=payroll`** — Required for that type. Why: I split wages by R&D / Sales & Marketing / General & Admin from this. If missing I ask: "Can you connect Gusto, Rippling, or Justworks, or paste the pay-period summary with gross, taxes, benefits, and net pay by department?"

## Steps
<!-- houston-workflow:v1 -->

1. **Parse inputs.** Required: `type` (one of `accrual` | `prepaid` | `payroll` | `revrec` | `depreciation` | `stock-comp` | `adjustment` | `reclass`) and `period` (`YYYY-MM`). Optional: `mode` (only meaningful when `type=accrual`  -  `reversing`), short `slug` for filename.

2. **Read context.** Load `context/bookkeeping-context.md` (stop if missing), `config/context-ledger.json`, `config/chart-of-accounts.json` (**locked** for run  -  stop if absent), `accruals.json` (empty array if absent). For payroll / depreciation / stock-comp, also read type-specific config (below).

3. **Branch on `type`.** Each branch builds `lines[]` array; Step 4 validates before writing.

   ### `accrual`
   Period-end accrual (unbilled revenue, accrued payroll, accrued interest). Debit expense / revenue line, credit `Accrued Liabilities` (or debit `Accrued Revenue` + credit revenue). `reversing: true` by default. Append to `accruals.json`: `{id, type, active: true, reversing: true, period, amount, glCode, counterGlCode, memo, createdAt, updatedAt}`.

   **`mode=reversing` sub-mode.** Read `accruals.json`, find every entry with `active=true AND reversing=true AND period < current`. For each, produce reversing journal entry with `reversesEntryId` pointing at original and sign convention flipped. Mark original `active: false` and set `reversedOn`. Write each reversal as separate journal entry.

   ### `prepaid`
   Amortize prepaid (rent, SaaS, insurance). Debit expense account, credit prepaid-asset account. `reversing: false`. Memo: `"Amortize {asset}  -  {period}"`.

   ### `payroll`
   Pay-period summary. Source order: connected app (`composio search payroll` → Gusto / Rippling / Justworks / Deel / ADP, schema via `--get-schema`) > pasted summary `{gross, taxes, benefits, netPay, byDepartment: {rd, sm, ga}}`. Lines: debit `Wages  -  R&D / Sales & Marketing / General & Admin` per chart of accounts, debit `Payroll Taxes`, debit `Employee Benefits`; credit `Wages Payable` (or `Cash` if paid in-period  -  ask once), `Payroll Tax Liabilities`, `Benefits Payable`. Memo: `"Payroll  -  {period}  -  {provider}"`.

   ### `revrec`
   Read every `revrec/**/*.json`, pick rows with `period = current`. Debit `Deferred Revenue`, credit revenue account. Multi-currency → aggregate in home currency (already on schedule). Memo: `"Revenue recognition  -  {period}  -  {N} contracts"`.

   ### `depreciation`
   Read `config/fixed-assets.json` (shape: `[{id, description, class, cost, salvage, usefulLifeMonths, inServiceOn, method: "straight-line"}]`). If absent, ask ONCE for schedule (file > paste)  -  NEVER invent. Compute `(cost - salvage) / usefulLifeMonths` per asset, group by class. Debit `Depreciation Expense  -  {class}`, credit `Accumulated Depreciation  -  {class}`. Memo: `"Depreciation  -  {period}  -  {N} assets"`.

   ### `stock-comp`
   Read `config/stock-comp.json` (shape: `{valuation: {fmv, asOf}, grants: [{employeeId?, grantDate, shares, strike, vestingMonths, cliff}]}`). If absent, ask ONCE for 409A + vesting schedule. Linear expense after cliff per ASC 718. Debit `Stock-Based Compensation Expense` (split by R&D / Sales & Marketing / General & Admin if chart of accounts supports), credit `Additional Paid-in Capital`. Memo: `"Stock-based compensation  -  {period}  -  {N} grants"`. If `context/bookkeeping-context.md` flags stock-based compensation as hard-no without sign-off, stop and surface draft for approval.

   ### `adjustment`
   General manual adjustment. User dictates `{glCode, debit, credit, memo}` per line (2+ lines). Common sources: unrecorded fees from reconciliations, forex rounding, prior coding corrections.

   ### `reclass`
   Inputs `{fromGlCode, toGlCode, amount, memo}`. Debit `toGlCode`, credit `fromGlCode`. Both should be expense-or-asset lines; cross-section (expense → liability) requires `type=adjustment` instead.

4. **Validate before write.** Hard guards  -  failure stops write, surfaces error:
   - `sum(debits) === sum(credits)` within 1 cent.
   - Every `glCode` exists in `config/chart-of-accounts.json` (not just parent  -  exact code).
   - `lines[].length >= 2`.
   - `type = reversing` implies `reversesEntryId` set AND referenced journal entry has `reversing: true` AND sign convention flipped.
   - No `status: "posted"` (only `draft` allowed from this skill).

5. **Write journal entry markdown** to `journal-entries/{YYYY-MM}/{type}-{slug}.md`. Structure:
   - Header: `id`, `type`, `period`, `date`, memo, status, reversing, reversesEntryId (if any).
   - **Lines**  -  markdown table `{glCode | glName | debit | credit | memo}`.
   - Totals row: debit total, credit total, diff (should be 0).
   - Supporting docs: paths referenced (pay-period summary, revenue recognition schedule, fixed-assets file, receipts).
   - Notes: open questions surfaced inline.

6. **Append to `journal-entries.json`** at agent root. Atomic read-merge-write. Full schema from `data-schema.md`: `{id, createdAt, updatedAt, date, type, memo, reversing, reversesEntryId?, period, lines[], status: "draft", supportingDocs?}`.

7. **Type-specific side effects.**
   - `accrual` (not reversing sub-mode) → append to `accruals.json` with `active: true`.
   - `accrual mode=reversing` → update original accrual row's `active: false, reversedOn, reversedByEntryId`.
   - `revrec` → stamp matching rows in relevant `revrec/{customer-slug}/{contract-slug}.json` as `recognized: true, recognizedBy: {id}` for that period.
   - `depreciation` → stamp matching rows in `config/fixed-assets.json` with `lastDepreciatedPeriod: "{period}", accumulated += monthly`.

8. **Append one `outputs.json` row**: `{type: "journal-entry", title: "{type} journal entry  -  {period}  -  {slug}", summary, path, status: "draft", domain: "close"}`. Read-merge-write; never overwrite.

9. **Summarize to user.** One compact block: journal entry id, total amount, type, path, reminder it's `draft` until user posts to QuickBooks Online / Xero and confirms. Offer to flip `status: "posted"` on explicit confirm only.

## Outputs

- `journal-entries/{YYYY-MM}/{type}-{slug}.md`  -  human-readable journal entry with balanced lines table.
- `journal-entries.json`  -  read-merge-write, journal entry appended with `status: "draft"`.
- `accruals.json`  -  only on `type=accrual` (append) or `type=accrual mode=reversing` (update original row).
- `revrec/{customer-slug}/{contract-slug}.json`  -  only on `type=revrec` (stamp recognized period).
- `config/fixed-assets.json`  -  only on `type=depreciation` (stamp last depreciated period + accumulated).
- `outputs.json`  -  one row appended, `type: "journal-entry"`.