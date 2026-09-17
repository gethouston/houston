---
name: import-my-prior-books
description: "Backfill memory from your prior system: a QuickBooks Online or Xero export, a CSV, or a spreadsheet from your prior accountant. I seed your chart of accounts (only if you don't have one), build an opening trial balance from the prior period's closing balances, and learn vendor-to-account-code rules from transaction history with an 80%-confidence majority threshold so noisy parties don't poison future categorization. Strictly one-way read — I never push back to QuickBooks Online or Xero, never rewrite the prior books."
version: 1
category: Bookkeeping
featured: no
image: ledger
integrations: [quickbooks, xero]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Import My Prior Books

Pulls your prior year's bookkeeping into memory so this year doesn't start cold. I read a QuickBooks Online export, a Xero export, or a generic CSV / xlsx; seed your chart of accounts if you don't have one; build the opening trial balance from prior closing balances; and learn vendor-to-account-code rules from transaction history. Every downstream skill — `process-my-statements`, `categorize-my-transactions`, `close-my-month` — starts with vendor knowledge already loaded.

Read-only: I never connect back to push, never rewrite your prior books. I learn from them.

## When to use

- "load the prior year's books" / "import from QuickBooks" / "backfill from this spreadsheet" / "pull in our Xero history".
- "seed vendor memory from last year's transaction list".
- Called implicitly by `set-up-my-books mode=opening-balances` when you drop a full prior-period export instead of a trial balance-only file.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **QuickBooks Online or Xero** (accounting) — optional, only used if you want me to pull the general ledger or Transaction List directly instead of dropping a file. File drop is the preferred path.

This skill works fully from a dropped file (xlsx or CSV export). No connection blocks the run.

## Information I need

I read your bookkeeping context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your fiscal year end** — Required. Why: defines the boundary between prior closing balances and our opening balances. If missing I ask: "What's the company's fiscal year end, e.g. December 31 or some other date?"
- **Cash vs. accrual accounting** — Required. Why: changes how I interpret balances on accrued and deferred lines. If missing I ask: "Are we keeping the books on cash or on accrual?"
- **The prior-period transaction history** — Required. Why: I can't seed vendor memory or opening balances without it. If missing I ask: "Can you export the prior year's general ledger or Transaction List from QuickBooks Online or Xero, or share the prior accountant's spreadsheet? Drop it as xlsx or CSV."
- **Confirmation on which closing balances to use as opening** — Optional. Why: if your import covers multiple periods I need to know which period-end becomes our opening trial balance. If you don't have a specific cut-off in mind I default to your fiscal year end and confirm before writing.

## Steps
<!-- houston-workflow:v1 -->

1. **Read config.** Load `config/context-ledger.json`  -  required: `universal.company.fiscalYearEnd` (determines import period boundary), `universal.accountingMethod` (cash vs. accrual affects opening balance interpretation). If missing, ask ONE targeted question (modality hint: connected app > file > URL > paste) and continue.

2. **Identify source format.** User drops one of:
   - **QuickBooks Online General Ledger export**  -  xlsx/csv, columns roughly `{Date, Transaction Type, Num, Name, Memo/Description, Account, Split, Amount, Balance}`.
   - **QuickBooks Online Transaction List**  -  xlsx/csv with `{Date, Transaction Type, Num, Posting, Name, Memo/Description, Account, Split, Amount}`.
   - **Xero export** (General Ledger Detail or Account Transactions)  -  csv with `{Date, Source, Description, Reference, Debit, Credit, Running Balance, Account Code, Account Name}`.
   - **Generic CSV / xlsx**  -  user must specify column map, or ask: `{date, party|vendor, amount|debit+credit, gl_code, gl_name, memo?}`.

   Detect format by column headers. If ambiguous, confirm inline with one question. For xlsx use `openpyxl`; for CSV use stdlib `csv` module.

3. **Discover Composio connection only if needed.** If user asks pull direct from QuickBooks Online / Xero instead of file drop, discover slug at runtime:

   ```bash
   composio search accounting
   ```

   Never hardcode tool names. If no connection exists, print link command and stop  -  no invent data. File drop always preferred path; connected-app pull is option, not default.

4. **Parse into normalized row stream.** Every source row lands as:

   ```ts
   {
     date: string;          // YYYY-MM-DD
     party: string;         // raw vendor/customer name from the source
     amount: number;        // signed: money out of the business = negative
     glCode: string;        // text, validated later against chart of accounts
     glName: string;
     memo?: string;
     docType?: string;      // "Bill", "Check", "Invoice", etc.
   }
   ```

   QuickBooks Online debits/credits: `Amount` column already signed in General Ledger export. In Transaction List, `Amount` reflects account's natural balance  -  check `Account` column to normalize to agent-wide sign convention (money out of business = negative).

   Xero: compute `amount = debit - credit`, then apply same sign convention per account type (asset/expense debits = positive = money out ⇒ flip to negative; revenue/liability credits = money in ⇒ leave positive).

5. **Seed chart of accounts (only if ours missing).** If `config/chart-of-accounts.json` does NOT exist AND export includes a chart of accounts (QuickBooks Online and Xero exports both do  -  unique set of `{gl_code, gl_name, account_type}` tuples), build initial chart of accounts from export. Normalize:
   - Coerce every `code` to string.
   - Map source's account-type vocabulary to our enum: `Bank / Accounts Receivable / Other Current Asset / Fixed Asset` → `asset`; `Accounts Payable / Credit Card / Other Current Liability / Long Term Liability` → `liability`; `Equity` → `equity`; `Income / Other Income` → `revenue`; `Cost of Goods Sold` → `cogs`; `Expense / Other Expense` → `expense`.
   - Assign `statementSection` per `build-my-chart-of-accounts` Step 5 validation rules  -  default operating expense lines to `operating-expenses.ga` and flag in summary so user can reclassify to `.rd` / `.sm`.
   - Write via `build-my-chart-of-accounts` schema and validators. **Do NOT overwrite existing chart of accounts**  -  if exists, leave alone and report any new codes in export as candidates for follow-up revision.

6. **Build opening trial balance.** From prior period's CLOSING balances (last row per account code in General Ledger export, or `Running Balance` column at period end in Xero):

   - Group by `glCode`; take final balance.
   - Positive balances for `asset` + `expense` + `cogs` types go to `debit`; negative go to `credit`. Positive for `liability` + `equity` + `revenue` types go to `credit`; negative to `debit`.
   - Sum debits and credits across whole trial balance. If not balanced within 1 cent, surface diff and stop  -  no plug.
   - Write `config/opening-trial-balance.json` atomically as `[{glCode, debit, credit}]`.
   - Update `config/context-ledger.json → universal.openingBalances` with `{asOf, source: "qbo-import" | "xero-import" | "prior-books", trialBalancePath: "config/opening-trial-balance.json", capturedAt}` (read-merge-write).

7. **Seed prior categorizations.** From transaction history:

   - Canonicalize each `party` using same rules as `process-my-statements` Stage 4 (strip noise prefixes, trailing reference numbers, city/state suffixes; Title Case).
   - Group transactions by `canonical_party`. For each party, count occurrences per `glCode`.
   - Take majority `glCode` ONLY if accounts for ≥ 80% of party's transactions AND party has ≥ 3 transactions. Otherwise skip (ambiguous parties poison next run  -  same rule as Step 7 in `process-my-statements`).
   - Validate winning `glCode` against chart of accounts. Drop any not resolving.
   - Write `config/prior-categorizations.json` atomically as `{canonical_party: gl_code}`. If file exists, read-merge-write  -  preserve existing entries unless import majority disagrees with confidence ≥ 0.95, in which case log conflict and keep existing entry (agent been learning from real runs; import is historical).

8. **Mark period as imported in `run-index.json`.** Read existing `run-index.json` (create empty array if absent), append:

   ```json
   {
     "id": "{uuid4}",
     "period": "2023",
     "periodStart": "2023-01-01",
     "periodEnd": "2023-12-31",
     "status": "imported",
     "source": "qbo-import" | "xero-import" | "csv-import",
     "accountsIncluded": ["..."],
     "transactionCount": 0,
     "createdAt": "{now}",
     "updatedAt": "{now}"
   }
   ```

   Write atomically (read-merge-write  -  never overwrite).

9. **DO NOT write detailed transactions.** This skill no produce `runs/{period}/run.json`  -  imported period not run we own, it's prior system's ledger. If user want reviewed workbook for imported period, drop statements into `statements/_inbox/` and invoke `process-my-statements`, which benefit from seeded prior-categorizations.

10. **DO NOT append to `outputs.json`.** Chart of accounts, opening trial balance, prior-categorizations all config. `run-index.json` row is single index entry, there.

11. **Summarize to user.** Counts: transactions parsed, unique parties canonicalized, prior-categorizations seeded (with ≥ 80% / ≥ 3-txn threshold explained), chart of accounts rows adopted (or skipped because ours exists), opening trial balance balance-check result. Flag ambiguous parties that missed threshold  -  founder can promote manually via `categorize-my-transactions mode=rule-add`. Next move: "process this year's statements and categorization will hit most rows from prior memory".

## Outputs

- `config/chart-of-accounts.json`  -  only if we didn't have one.
- `config/opening-trial-balance.json`  -  prior period closing trial balance, now opening trial balance of our books.
- `config/prior-categorizations.json`  -  seeded vendor memory (read-merge-write).
- `config/context-ledger.json`  -  `universal.openingBalances` refreshed (read-merge-write).
- `run-index.json`  -  one new row with `status: "imported"` (read-merge-write).

No entry in `outputs.json`.