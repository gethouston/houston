---
name: process-my-statements
description: "Process a batch of PDF or CSV bank and credit-card statements end to end: extract every transaction (parallel Haiku subagents), canonicalize the party names, categorize against your locked chart of accounts (parallel Sonnet subagents), detect inter-account transfers, and assemble a reviewed Google Sheets workbook with a formula-driven P&L. Reconciliation mismatches surface as warnings, low-confidence categorizations land in Suspense — I never invent an account code, never silently plug a number, never post to your accounting system."
version: 1
category: Bookkeeping
featured: no
image: ledger
integrations: [googlesheets, stripe]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Process My Statements

Drop a batch of PDF or CSV bank and credit-card statements and I produce a reviewed Google Sheets workbook with a formula-driven P&L. Full pipeline: extract every transaction in parallel, canonicalize parties, categorize against your locked chart of accounts, tag inter-account transfers, and write a workbook you can hand to your accountant. Suspense bucket and reconciliation warnings sit at the top — I never plug, never invent an account code, never post.

## Output Target: Google Sheets via Composio

Use the Composio CLI available in PATH. All Google Sheets writes go through it.

**Before any run**, verify `googlesheets` toolkit connected:

```bash
composio execute GOOGLESHEETS_SEARCH_SPREADSHEETS -d '{"query": "", "max_results": 1}'
```

If returns `"No active connection found for toolkit \"googlesheets\""`, STOP and ask user to connect:

```bash
composio link googlesheets --no-wait
```

Take `redirect_url` from response, present to user as markdown link with `#houston_toolkit=googlesheets` appended (so Houston render connect card). Wait for approval before continuing.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Google Sheets** (spreadsheets) — required. The whole pipeline ends in a Google Sheets workbook with a formula-driven P&L; without it there's no output. See the "Output Target: Google Sheets via Composio" block above for the verification command and connect link.
- **Stripe** (billing) — optional. Pulls payouts and processor fees so they categorize cleanly when they show up in your bank feed.

If Google Sheets isn't connected I stop and ask you to connect it before doing any work.

## Information I need

I read your bookkeeping context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **A finished bookkeeping context** — Required. Why: I need your accounting method, suspense code, and registered accounts before I categorize. If missing I ask: "Have we set up the books yet? If not, run the setup once so I know your fiscal year, accounting method, and registered accounts."
- **A chart of accounts** — Required. Why: I lock it during the run; every category I assign has to come from your chart of accounts. If missing I ask: "Do we have a chart of accounts yet? If not, let's draft one first."
- **Your bank accounts and credit cards** — Required. Why: I group transactions by last 4 and need each account's account code. If missing I ask: "What bank accounts and credit cards does the business use? I'll register any new ones automatically when statements come in, but it's faster if you tell me up front."
- **The statements to process** — Required. Why: the pipeline starts from PDFs or CSVs you drop. If missing I ask: "Can you drop the bank and credit card statements as PDFs, or attach them in chat?"
- **Vendor rules from a prior period** — Optional. Why: lets me match new charges to known vendors and keep questions to a minimum. If you don't have them I keep going and learn from this run.

## Storage Layout

Agent single-company. Chart of accounts + memory live at agent root (flat). Each run get own folder under `runs/{period}/`.

```
context/
└── bookkeeping-context.md                  # live brief (entity, fiscal year, accounting method)

config/
├── context-ledger.json                     # metadata: company, accounting-method, banks, etc.
├── chart-of-accounts.json                  # authoritative chart of accounts (locked during a run)
├── prior-categorizations.json              # {canonical_party: gl_code}  -  vendor history
└── party-rules.json                        # user-confirmed exact rules

statements/                                  # source PDFs + side files (vendor list, etc.)
└── _inbox/                                 # drop zone for PDFs before this pipeline runs

runs/
└── {period}/                               # e.g., 2024, 2024-Q1, 2024-01
    ├── run.json                            # full run artifact (the recovery source)
    ├── _extractions/{pdf_stem}.json        # transient  -  Haiku extractor outputs (one per PDF)
    ├── _work/{account_last4}.json          # transient  -  packets handed to each Categorizer
    ├── _categorizations/{account_last4}.json  # transient  -  Sonnet categorizer outputs
    └── _sheet_state/{period}.json          # transient  -  Sonnet Sheets Writer output
```

If directory missing, create with `mkdir -p` on first use.

**Bank accounts** live on context ledger, not separate `client.json`:

```jsonc
// config/context-ledger.json (excerpt)
{
  "domains": {
    "banks": {
      "accounts": [
        {"last4": "9041", "type": "credit-card", "bank": "Chase",
         "glCode": "20000", "glName": "Chase CC #9041"}
      ]
    }
  },
  "universal": {
    "suspenseCode": { "code": "99999", "name": "Suspense" }
  }
}
```

## Inputs

User provides one or more:
1. Explicit PDF paths in message (most common  -  attachments dropped into chat).
2. PDFs in `statements/_inbox/`  -  list with `ls statements/_inbox/*.pdf`.
3. Period identifier (year / quarter / month)  -  used for `runs/{period}/` folder name.
4. (Optional) custom chart of accounts file (xlsx / csv / inline text), vendor list, or prior Transaction Detail.

## Procedure
<!-- houston-workflow:v1 -->

### Step 1  -  Bootstrap context + lock chart of accounts

1. **Load existing state:**
   - `context/bookkeeping-context.md`  -  brief. If missing, stop and ask user to run `set-up-my-books` first (or ask to do inline).
   - `config/context-ledger.json`  -  accounts, suspense code.
   - `config/chart-of-accounts.json`  -  authoritative chart of accounts. If exists, **LOCK for this run.**
   - `config/prior-categorizations.json`  -  vendor → account code memory.
   - `config/party-rules.json`  -  exact-match rules.

2. **First-run bootstrap (only if `config/chart-of-accounts.json` absent):**
   - If user provided chart of accounts file (xlsx/csv), parse (openpyxl for xlsx) into `config/chart-of-accounts.json` as `[{code, name, type, statementSection}]`.
   - If user described chart of accounts inline, structure that way.
   - Else fall back to bundled default in `CHART_OF_ACCOUNTS.md`  -  but copy to `config/chart-of-accounts.json` so next runs share codes.
   - Copy source PDFs + side files into `statements/` (keep filenames; subfolders per account OK, e.g., `statements/9041/2024-01.pdf`).
   - If prior Transaction Detail provided, extract `{vendor_name: [gl_codes]}` and seed `config/prior-categorizations.json` with majority code per vendor (only if consistent in ≥ 80% past records).

3. **Lock chart of accounts for rest of run.** Treat `config/chart-of-accounts.json` immutable until Step 7. If transaction can't categorize, send to Suspense  -  NEVER invent new account code.

4. **Determine period.** Default: min(period_start) to max(period_end) across all statements. Period slug: `YYYY` for full-year, `YYYY-QN` for quarter, `YYYY-MM` for single month. Create `runs/{period}/_extractions/`, `runs/{period}/_work/`, `runs/{period}/_categorizations/`, `runs/{period}/_sheet_state/`.

### Step 2  -  Extract transactions (parallel Haiku subagents)

**Don't read PDFs in orchestrator  -  dispatch Haiku subagents in parallel.** Much faster, keeps orchestrator context clean for categorization and Sheets assembly.

**Dispatch pattern:**

For each PDF (or small batch ≤ 3 single-month PDFs from same account), launch one `Agent` call in parallel with:
- `subagent_type: "general-purpose"`
- `model: "haiku"`
- `description: "Extract {bank} {account_last4} {YYYY-MM}"` (or similar, 3–5 words)

**Send all dispatches in one message so they run concurrently.** Twelve monthly statements → twelve parallel agents, finish in roughly time of one.

Each subagent writes result to disk at `runs/{period}/_extractions/{source_pdf_stem}.json` and returns short confirmation ("wrote N transactions, reconciles: yes/no"). Orchestrator reads JSON files back after all agents complete.

**Subagent prompt template** (paste, fill `{...}` per dispatch):

```
You are extracting transactions from a single bank or credit card statement PDF.

PDF path: {absolute_pdf_path}
Expected account_last4 (if known): {last4 or "unknown"}
Expected account type: {"credit_card" | "checking" | "savings" | "unknown"}

TASK
Read the PDF with the Read tool (it is multimodal  -  it sees the pages). If the PDF has
more than 10 pages, use the `pages` parameter to read it in slices. Extract EVERY
transaction and the statement's opening/closing balances. Write the result as JSON to:

  {output_path}

OUTPUT JSON SCHEMA
{
  "source_pdf": "{pdf filename, not path}",
  "bank_name": "Chase" | "Wells Fargo" | etc.,
  "account_last4": "9041",
  "account_type": "credit_card" | "checking" | "savings",
  "statements": [                            // usually one, but multi-period PDFs can have many
    {
      "statement_date": "2023-01-12",
      "period_start": "2022-12-13",
      "period_end": "2023-01-12",
      "opening_balance": 1090.96,
      "closing_balance": 1085.63,
      "transactions": [
        {"date":"2022-12-15","description":"...","amount":-45.00,"source_page":3}
      ]
    }
  ]
}

SIGN CONVENTION  -  NON-NEGOTIABLE
Normalize to "money out of the business = negative, money in = positive":
- Checking / savings: deposits +, withdrawals / debits / fees -.
- Credit card: purchases / interest / fees -, payments / credits / returns +.
  (This is the OPPOSITE of how many CC statements print; flip if needed.)

EXTRACTION DISCIPLINE
- The transaction AMOUNT is the change, not the running balance column.
- Skip "Beginning Balance" and "Ending Balance" marker rows.
- Include bank fees and interest as transactions.
- Continued-on-next-page rows: include once.
- Multi-period PDFs: emit one entry per statement under `statements[]`.
- Date format: ISO YYYY-MM-DD. If a txn date is ambiguous (12/15 with no year) use the
  year consistent with the statement period.

RECONCILIATION SELF-CHECK
Before writing the file, verify for each statement:
   computed_close = opening_balance + sum(transaction.amount)   (for checking/savings)
   computed_close = opening_balance - sum(transaction.amount)   (for credit_card, using the sign convention above)
If |computed_close - closing_balance| > 0.02, include a "reconciliation_note" field
on that statement describing the diff  -  do NOT silently force a match.

Write the JSON file. Return a one-line summary:
"wrote {N} txns across {M} statement(s), recon: {ok|diff=$X.XX}"
```

**After dispatching, orchestrator:**

1. Wait for all subagents finish (run in parallel automatically).
2. Read each `runs/{period}/_extractions/*.json`.
3. Merge into single in-memory list per account_last4.
4. Dedupe on `(account_last4, date, amount, description)` if two statements overlap.
5. Apply same reconciliation self-check in orchestrator (trust but verify).

**When NOT dispatch subagents:**
- Only one small PDF, need data immediately  -  Read inline.
- PDF scanned image, very low quality  -  do yourself so can inspect OCR artifacts visually.
- Subagent returned reconciliation diff > $0.02  -  re-read specific statement yourself in orchestrator and correct extraction.

See `EXTRACTION.md` for named layout patterns (bare tables, running-balance columns, Wells Fargo Spanish layout, etc.)  -  include relevant pattern hint in subagent prompt when bank known in advance.

### Step 3  -  Reconciliation check (warning only, never blocking)

For each statement:
```
computed_closing = opening_balance + sum(transaction.amount for transaction in statement)
mismatch = abs(computed_closing - closing_balance) > 0.02   # 2 cent tolerance
```
If mismatched, add warning to reconciliation sheet and continue. Don't stop pipeline.

### Step 3b  -  Merge extractions and write Categorizer work packets

After all Haiku Extractors finish, orchestrator reads and merges output before dispatching Categorizers:

1. **Read all `runs/{period}/_extractions/*.json`.**

2. **Group transactions by `account_last4`.** For each unique last4 across all extraction files, collect all transactions from all statements for that account.

3. **Register new accounts.** Any `account_last4` not yet in `context-ledger.json → domains.banks.accounts[]`  -  add with bank name and account type from extraction file, leave `gl_code` blank for now.

4. **Deduplicate.** Within each account, remove duplicate transactions on `(date, amount, description)`  -  appear when statements overlap (e.g., two months share border date).

5. **Write one work packet per account** to `runs/{period}/_work/{account_last4}.json`:

```json
{
  "account_last4": "9041",
  "account_type": "credit_card",
  "bank": "Chase",
  "gl_code": "20000",
  "suspense_code": "99999",
  "transactions": [
    { "date": "2023-01-15", "description": "AMAZON.COM*AB12C NJ", "amount": -45.00, "statement_date": "2023-01-20" }
  ],
  "chart_of_accounts": [
    { "code": "6090", "name": "Office Expenses", "type": "expense" }
  ],
  "prior_categorizations": { "Amazon": "6090" },
  "party_rules": { "PG&E": "6150" }
}
```

Fields:
- `account_last4`, `account_type`, `bank`, `gl_code`  -  from `context-ledger.json → domains.banks.accounts[]` (gl_code may be blank for new accounts)
- `suspense_code`  -  from `context-ledger.json → universal.suspenseCode.code`
- `transactions`  -  merged, deduped list for this account only; include `statement_date` if present in extraction JSON
- `chart_of_accounts`  -  full contents of `config/chart-of-accounts.json`
- `prior_categorizations`  -  full contents of `config/prior-categorizations.json` (empty `{}` if absent)
- `party_rules`  -  full contents of `config/party-rules.json` (empty `{}` if absent)

6. **Create output subdirectories if absent:**
```bash
mkdir -p runs/{period}/_work
mkdir -p runs/{period}/_categorizations
mkdir -p runs/{period}/_sheet_state
```

### Step 4+5  -  Dispatch Categorizer subagents (Sonnet, parallel)

**Don't canonicalize or categorize inline in orchestrator.** Dispatch one Sonnet Categorizer per `account_last4` in single message so run concurrently. For accounts with >500 transactions, split into ≤500-row chunks and dispatch multiple agents for same account (outputs concat in order).

**Dispatch pattern:**

For each account (one Agent call per account in single message):
- `subagent_type: "general-purpose"`
- `model: "sonnet"`
- `description: "Categorize {bank} {account_last4}"` (3–5 words)

**Each Categorizer returns one-line status:**
`"account {last4}: {N} txns, {R} ready / {V} review / {U} suspense (${S})"`

---

**Categorizer subagent prompt template** (fill `{...}` per account):

```
You are categorizing bank/credit card transactions for bookkeeping.

Work packet path: {absolute_work_packet_path}
Output path: {absolute_output_path}

TASK
1. Read the work packet JSON at the work packet path above.
2. For each transaction, canonicalize the party name (Stage 4 below) then categorize it (Stage 5 below).
3. Write the result JSON to the output path.
4. Return exactly one line: "account {last4}: {N} txns, {R} ready / {V} review / {U} suspense (${S})"

---

STAGE 4  -  CANONICALIZE PARTY NAMES

For each transaction's description field, derive a canonical party name:
1. Strip noise prefixes: "POS DEBIT", "CHECKCARD", "DEBIT CARD PURCHASE", "ACH", "ONLINE PMT", "SQ *", "TST*", "PREAUTHORIZED DEBIT"
2. Strip trailing reference numbers (runs of 6+ digits), location codes (#12345), city+state suffixes (e.g. "SEATTLE WA", "NEW YORK NY")
3. Collapse whitespace, apply Title Case
4. If the cleaned name fuzzy-matches an entry in the work packet's prior_categorizations or party_rules (token set ratio ≥ 0.85), use the canonical form stored there (the key), not your cleaned version

Examples:
- "POS DEBIT AMAZON.COM*AB12C NJ" → "Amazon" (if "Amazon" is in prior_categorizations)
- "SQ *JOE'S COFFEE SHOP SEATTLE WA" → "Joe's Coffee Shop"
- "ACH DEBIT PG&E UTILITY PMT" → "PG&E"
- "CHECKCARD 0115 SHELL OIL 12345678" → "Shell Oil"
- "ONLINE PMT CHASE CREDIT CRD AUTOPAY" → "Chase Autopay" (will go to Suspense  -  see below)

---

STAGE 5  -  CATEGORIZE EACH TRANSACTION

Use this priority order for every transaction. Stop at the first hit:

**1. party_rules exact match**
If the canonical party exactly matches a key in the work packet's party_rules, assign that account code.
- confidence: 1.00
- source: "rule"

**2. prior_categorizations fuzzy match**
If the canonical party fuzzy-matches a key in prior_categorizations (token set ratio ≥ 0.85) AND the stored account code is in the chart_of_accounts, use it.
- confidence: 0.95
- source: "prior_year"

**3. Your reasoning against the chart_of_accounts**
Look at description, canonical party, amount, and the account type. Pick the best account code from the chart_of_accounts.
Assign a calibrated confidence:
- 0.95+: obvious and unambiguous (e.g., "PG&E" → Utilities; "Stripe Transfer" → Sales Revenue)
- 0.90–0.94: one reasonable candidate, but not certain
- < 0.90: multiple plausible categories, or unclear vendor → send to Suspense (see below)
- source: "ai"

**4. Suspense**
If no hit above OR confidence < 0.90, assign the suspense_code from the work packet.
- gl_name: "Suspense"
- confidence: 0.50
- source: "ai"
- category_status: "uncategorized"

**category_status rules:**
- "ready_for_approval" if confidence ≥ 0.90 AND source ∈ {rule, prior_year}
- "review_categorization" if confidence ≥ 0.90 AND source = "ai"
- "uncategorized" if confidence < 0.90

**SIGN CONVENTION:** The work packet already has correct signs  -  do NOT flip amounts. For credit cards: purchases are negative, payments/credits are positive.

**DO NOT assign account code 9000 (Internal Transfer).** You cannot see other accounts' transactions. If a transaction looks like an inter-account transfer (e.g., "Chase Autopay", "Transfer to Checking"), send it to Suspense unless it exactly matches a party_rule.

**DO NOT invent account codes** not present in the chart_of_accounts.

---

OUTPUT JSON  -  write this to the output path:

{
  "account_last4": "9041",
  "transactions": [
    {
      "date": "2023-01-15",
      "description": "AMAZON.COM*AB12C NJ",
      "amount": -45.00,
      "statement_date": "2023-01-20",
      "party": "Amazon",
      "gl_code": "6090",
      "gl_name": "Office Expenses",
      "confidence": 0.95,
      "source": "prior_year",
      "category_status": "ready_for_approval"
    }
  ],
  "summary": {
    "total_count": 412,
    "ready_for_approval": 380,
    "review_categorization": 20,
    "uncategorized": 12,
    "suspense_dollar_amount": 1250.44,
    "confidence_histogram": {"0.95-1.00": 380, "0.90-0.94": 20, "<0.90": 12},
    "new_parties": ["Foo Supplier", "Bar Vendor"]
  }
}

"new_parties": canonical party names not found as keys in prior_categorizations or party_rules.
"statement_date": pass through from the source transaction in the work packet if present.
"suspense_dollar_amount": sum of absolute values of amounts for uncategorized transactions.

Write the file. Return the one-line summary.
```

---

**After all Categorizers finish, orchestrator:**

1. Read `_categorizations/{account_last4}.json` for every account.
2. Apply cross-account transfer detection:
   - For each debit in account A on date D: search all other accounts for credit on date D±2 with same absolute amount.
   - Both matching legs: set `gl_code = "9000"`, `gl_name = "Internal Transfer"`, `source = "transfer"`, `category_status = "ready_for_approval"`.
   - Transfer pairs flagged in run artifact, excluded from P&L SUMIFS formulas.
3. Assemble `runs/{period}/run.json` by merging all accounts' categorized transaction arrays plus metadata.

`run.json` schema:
```json
{
  "companyName": "Acme Startup, Inc.",
  "period": "2023",
  "period_start": "2023-01-01",
  "period_end": "2023-12-31",
  "generated_at": "2026-04-16",
  "accounts": [
    { "last4": "9041", "type": "credit_card", "bank": "Chase", "gl_code": "20000", "transaction_count": 412 }
  ],
  "transactions": [
    {
      "account_last4": "9041",
      "date": "2023-01-15",
      "description": "AMAZON.COM*AB12C NJ",
      "amount": -45.00,
      "statement_date": "2023-01-20",
      "party": "Amazon",
      "gl_code": "6090",
      "gl_name": "Office Expenses",
      "confidence": 0.95,
      "source": "prior_year",
      "category_status": "ready_for_approval"
    }
  ],
  "reconciliation_warnings": []
}
```

### Gate 1  -  Post-Categorize Review (never blocking)

Orchestrator reads only `summary` block from each `_categorizations/*.json` (not full transaction arrays). Check:

| Check | Threshold | Action |
|---|---|---|
| Suspense rate | > 25% of txns in any single account | Add named warning to final report |
| Suspense dollar | > 30% of total absolute transaction volume across all accounts | Add named warning to final report |
| Repeat uncategorized party | Any canonical party appears ≥ 10x with `confidence < 0.90` | Add named flag: "'{party}' appears {N}x uncategorized  -  consider adding a party rule" |
| Reconciliation mismatches | Any `reconciliation_note` in any `_extractions/*.json` | Surface in report (already collected in Step 3) |
| Cross-account transfers found | Count and total absolute amount | Log: "Found {N} transfer pair(s) totaling ${X}  -  tagged account code 9000" |

Gate 1 never blocks. Accumulate findings into `gate1_warnings` list, carry into Step 8 report.

### Step 6  -  Dispatch Sheets Writer subagent (Sonnet, single)

**Don't call Composio inline in orchestrator.** Dispatch single Sonnet Sheets Writer that reads assembled `run.json` and owns full workbook creation.

**Dispatch:**
- `subagent_type: "general-purpose"`
- `model: "sonnet"`
- `description: "Write Google Sheet {period}"`

**Writer returns one line:**
`"sheet ready: {url}  -  NI ${pnl_net_income}, Adj NI ${pnl_adjusted_net_income}, 0 errors"`
or
`"sheet FAILED: error_cells=[P&L!B44, ...]"`

---

**Sheets Writer subagent prompt template:**

```
You are creating a Google Sheets bookkeeping workbook from categorized transaction data.

Input files  -  read all of these:
- Run data:            {absolute_run_json_path}
- Context ledger:      {absolute_context_ledger_path}
- Chart of accounts:   {absolute_coa_json_path}
- Sheets spec:         {absolute_sheets_spec_path}

Output path: {absolute_sheet_state_path}

TASK
1. Read SHEETS_SPEC.md at the sheets spec path above  -  it is your complete instruction manual for creating the workbook via Composio. Follow it exactly.
2. Read run.json, context-ledger.json, and chart-of-accounts.json.
3. Create the Google Sheet workbook following the spec.
4. Write the sheet state JSON to the output path.
5. Return exactly one line (format below).

The Composio CLI is at composio (not on PATH  -  use full path).

CRITICAL RULES  -  these override anything else:
1. Set locale to "en_US" IMMEDIATELY after creating the spreadsheet, before writing any data.
   Use UPDATE_SPREADSHEET_PROPERTIES with: {"properties": {"locale": "en_US"}, "fields": "locale"}
   If you skip this step, formulas will silently fail on non-English Google accounts (#ERROR).
2. Always pass "value_input_option": "USER_ENTERED" on every batch write. RAW turns formulas into string literals.
3. Prefix all account codes with a single quote when writing cell values (e.g., "'6090") so Sheets stores them as text, not numbers. SUMIFS string-matching will break silently if you skip this.
4. Tool parameter casing is inconsistent  -  always run --get-schema before using a new tool:
   - DELETE_SHEET, UPDATE_SPREADSHEET_PROPERTIES, UPDATE_SHEET_PROPERTIES → camelCase (spreadsheetId, sheetId)
   - APPEND_DIMENSION, ADD_SHEET, UPDATE_VALUES_BATCH, BATCH_GET → snake_case (spreadsheet_id, sheet_id)
5. P&L totals must be SUMIFS formulas, never hardcoded values.
6. Sheet names with spaces or & need single quotes in formulas: 'Chart of Accounts'!A:B, 'P&L'!B44.

VERIFICATION (after writing all tabs):
- Read back the P&L Net Income cell and Adjusted Net Income cell using GOOGLESHEETS_BATCH_GET
  with valueRenderOption: "UNFORMATTED_VALUE" (note camelCase) to get computed numbers.
- Scan the P&L and Transactions tabs for cells containing "#ERROR" or "#REF".
- Include the results in the output JSON.

OUTPUT JSON  -  write to the output path:
{
  "spreadsheet_id": "1abc...",
  "url": "https://docs.google.com/spreadsheets/d/1abc.../",
  "tabs_created": ["Chart of Accounts", "Transactions", "P&L", "Recon 9041"],
  "verification": {
    "locale_ok": true,
    "formulas_parsed": true,
    "pnl_net_income": 24512.30,
    "pnl_adjusted_net_income": 23261.86,
    "suspense_total": 1250.44,
    "error_cells": []
  }
}

Return exactly one line:
"sheet ready: {url}  -  NI ${pnl_net_income}, Adj NI ${pnl_adjusted_net_income}, {N} errors"
or if verification.error_cells is non-empty or any value is null:
"sheet FAILED: error_cells=[{comma-separated list}]"
```

---

### Gate 2  -  Post-Sheets Review (max one retry)

After Sheets Writer returns, orchestrator reads `_sheet_state/{period}.json` and checks:

| Check | Threshold | Action |
|---|---|---|
| `error_cells` non-empty | Any | Re-dispatch Sheets Writer with same inputs + note: "Fix these cells: {list}". Max 1 retry. |
| `pnl_adjusted_net_income` vs. local sum from run.json | Diff > $0.02 | Re-dispatch with note: "Adjusted Net Income mismatch  -  expected ${X}, got ${Y}. Check Suspense SUMIFS and transfer exclusion." |
| `formulas_parsed: false` |  -  | Re-dispatch with note: "Formulas parsed as text. Ensure locale is set to en_US BEFORE any batch write." |
| `verification.suspense_total` vs. Gate 1 suspense total | Diff > $0.02 | Re-dispatch with note: "Suspense total mismatch  -  expected ${X}, got ${Y}. Check Transactions tab row count." |

If single retry also fails: skip Step 7, output partial success message, preserve `run.json` path for manual recovery.

If Gate 2 passes: append sheet reference to `config/context-ledger.json` under `domains.banks.sheets[]` (create array if absent):
```json
{
  "period": "2023",
  "spreadsheet_id": "1abc...",
  "url": "https://docs.google.com/...",
  "accounts_included": ["9041", "1234"],
  "period_start": "2023-01-01",
  "period_end": "2023-12-31"
}
```
and bump `updatedAt` to today. Also append to `run-index.json` at agent root: `{id, period, status: "ready", sheetUrl, accountsIncluded[], suspenseTotal, pnlNetIncome}`.

---

### Step 7  -  Persist learnings

After successful output:
1. Open `config/prior-categorizations.json` (create if absent).
2. For every transaction with `source ∈ {rule, prior_year, transfer}` OR `confidence ≥ 0.95`, upsert `{canonical_party: gl_code}`.
3. Do NOT persist ambiguous (confidence < 0.90) categorizations  -  poison next run.
4. If chart of accounts changed mid-project (added/renamed codes via `build-my-chart-of-accounts`), rewrite `config/chart-of-accounts.json` AND reset `config/prior-categorizations.json` from this run's high-confidence entries only  -  stale codes from old chart of accounts misroute future transactions.

### Step 8  -  Report to user

Print concise summary:
- **Google Sheet URL** (clickable markdown link)  -  prominent at top
- Run folder path (`runs/{period}/`) and agent root (so user sees where memory/outputs live)
- Statements processed (count, by account)
- Transactions extracted (count, total absolute volume)
- Reconciliation warnings (if any  -  list)
- Categorization breakdown: X ready, Y needs review, Z in Suspense (with $ amount)
- Net Income and Adjusted Net Income  -  read from `runs/{period}/_sheet_state/{period}.json` fields `verification.pnl_net_income` and `verification.pnl_adjusted_net_income` (already computed by Sheets Writer)
- Gate 1 warnings (if any)  -  include each named warning verbatim
- Local JSON artifact path (`runs/{period}/run.json`)
- Number of new canonical parties persisted to `config/prior-categorizations.json`

Flag **Suspense dollar amount** prominently  -  that "cost of not finishing review".

## Critical Invariants  -  Do Not Violate

1. **Bank accounts grouped by `account_last4` only.** Never bank name. Names drift across statements.
2. **Credit card sign convention**: money out (purchases) = negative.
3. **Reconciliation mismatches are warnings, not errors.** Pipeline never stops on them.
4. **P&L is formulas, not values.** `=SUMIFS(...)`, always.
5. **Chart of accounts locked at categorization start.** Don't add account codes mid-run.
6. **Party canonicalization runs before categorization**, uses same function at every write path.
7. **Suspense visible.** Adjusted Net Income must appear on P&L.
8. **Don't persist low-confidence categorizations** to prior_categorizations.json.
9. **Always pass `"value_input_option": "USER_ENTERED"`** to Composio Sheets writes. `RAW` destroys formulas silently.
10. **Store account codes as text in Sheets** by prefixing `'` (e.g. `"'6090"`). Else SUMIFS miss every row.
11. **Extractor subagents always dispatched with `model: "haiku"`**  -  never default to orchestrator's model.
12. **Categorizer and Sheets Writer subagents always dispatched with `model: "sonnet"`**  -  never default to orchestrator's model.

## Reference Files

Load on demand during execution:

- `CHART_OF_ACCOUNTS.md`  -  default chart of accounts (income, cost of goods sold, expense, equity, transfer accounts)
- `EXTRACTION.md`  -  named layout patterns, credit-card quirks, multi-period handling
- `SHEETS_SPEC.md`  -  Google Sheets workbook structure, Composio tool usage, formula templates, call sequence

## Failure Modes to Watch

- **Scanned image PDFs no text layer**  -  visual Read still works (multimodal) but OCR errors creep in. Do yourself (no Haiku subagent) so can inspect artifacts visually. Flag low-confidence extractions, surface them.
- **PDF >10 pages**  -  Read requires `pages` parameter. Haiku subagent prompt already instructs slice; for very long PDFs (>30 pages) consider splitting by statement, dispatch one agent per month.
- **Haiku subagent returned reconciliation diff**  -  don't silently accept. Re-read that PDF yourself in orchestrator to fix extraction.
- **Haiku subagent mis-signed credit card statement**  -  most common error: purchases left positive. Spot-check at least first returned JSON before dispatching rest. If wrong, tighten sign-convention block in prompt.
- **CC recon cross-period**: transaction posted in statement N+1 may have `date` in statement N's window. Anchor recon on `Statement Date` column (see EXTRACTION.md), not date-range SUMIFS on Transactions!A:A.
- **Duplicate transactions across overlapping statements**  -  dedupe by (account_last4, date, amount, description) tuple.
- **Foreign currency transactions**  -  keep home-currency amount (as settled), note FX detail in description column.
- **Chargebacks / reversals**  -  real transactions, include both legs with opposite signs.
- **Chart of accounts drift mid-project**  -  if add or rename account codes mid-project, rewrite `chart_of_accounts.json` AND reset `prior_categorizations.json` from this run only. Stale codes WILL misroute future transactions.