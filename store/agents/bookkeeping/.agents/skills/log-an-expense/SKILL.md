---
name: log-an-expense
description: "Log a single expense from a forwarded receipt — image, PDF, or email — and produce one categorized expense plus one balanced journal entry. I extract vendor, date, amount, and line items via multimodal read, pick an account code against your locked chart of accounts (anything below 0.90 confidence lands in Suspense with the receipt attached), and draft the double-entry journal entry with the credit side keyed off how it was paid (corp card, founder loan, cash, or ACH). Sub-mode `mode=batch` rolls N receipts into one summary journal entry crediting Founder Loan Payable or Accrued Reimbursements. Draft only — I never post."
version: 1
category: Bookkeeping
featured: no
image: ledger
integrations: [gmail, outlook, quickbooks, xero]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Log an Expense

One receipt in, one categorized expense and one balanced journal entry out. For founder reimbursements, out-of-pocket vendor payments, or any expense that didn't show up in the bank or card feed. Every receipt either produces a balanced journal entry with the account code validated against your chart of accounts, or lands in Suspense with the image attached.

Drafts only: the journal entry is written at `status: "draft"`. I never auto-post to QuickBooks or Xero.

## When to use

- User forwards single receipt (image, PDF, email) or says "book this receipt" / "categorize this reimbursement".
- Expense absent from bank / card feed (reimbursed on personal card, ACH paid from another entity, cash).
- `mode=batch`  -  "process these 20 receipts for Q1" / "book founder's reimbursement batch"  -  produces one summary journal entry crediting Founder Loan Payable (or Accrued Reimbursements if same-period).

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Gmail or Outlook** (inbox) — optional, lets me pull a forwarded receipt and its attachments straight from your email. If not connected, you can drop the file into chat or into the receipts inbox folder.
- **QuickBooks Online or Xero** (accounting) — optional, used only if you want me to look up vendor history. The journal entry itself stays draft on disk; I never post.

This skill never blocks on a missing connection. You can always drop the receipt as a file.

## Information I need

I read your bookkeeping context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **A chart of accounts** — Required. Why: every category I assign has to come from your chart of accounts. If missing I ask: "Do we have a chart of accounts yet? If not, let's draft one first."
- **A finished bookkeeping context** — Required. Why: I need your accounting method and registered accounts to book the credit side correctly. If missing I ask: "Have we set up the books yet? If not, run the setup first."
- **The receipt itself** — Required. Why: vendor, date, and total are extracted from it. If missing I ask: "Can you forward the receipt, drop the PDF or image, or paste the vendor / date / amount?"
- **How the expense was paid** — Required. Why: drives the credit line (corp card vs. founder loan vs. cash). If missing I ask: "How was this paid, on a corporate card (which one?), a personal card you'll get reimbursed for, cash, or an ACH from another entity?"
- **A registered Founder Loan Payable account** — Optional. Why: needed only if the receipt was paid out-of-pocket. If you don't have it I ask once and add it to your chart of accounts.

## Steps
<!-- houston-workflow:v1 -->

1. **Read context & lock the chart of accounts.** Load `context/bookkeeping-context.md` (stop if missing  -  ask for `set-up-my-books`), `config/context-ledger.json`, `config/chart-of-accounts.json` (**locked** for run  -  stop if absent), `config/prior-categorizations.json`, and `config/party-rules.json`.

2. **Resolve receipt inputs.** Priority order:
   - **Inline attachment**  -  Read tool (multimodal) on file path user provided. Works on PDF and images (JPG / PNG / HEIC).
   - **Email forward**  -  `composio search inbox`, pick Gmail / Outlook slug, fetch message by ID or thread, then Read attachment files.
   - **File drop**  -  `expenses/_inbox/*.{pdf,jpg,png,heic,eml}` at agent root.

3. **Extract fields per receipt** via multimodal Read:
   - `vendor`  -  raw merchant name as printed.
   - `date`  -  YYYY-MM-DD; if only `MM-DD` printed, infer year from context.
   - `total`  -  positive dollar amount (invert for journal entry credit side).
   - `lineItems[]`  -  optional, when receipt itemizes: each `{description, amount, quantity?}`.
   - `paymentMethod`  -  "personal card" / "corp card 9041" / "cash" / "ACH"  -  ask once if unreadable.
   - `taxAmount`, `tipAmount`  -  when itemized separately.
   - `currency`  -  default USD; if foreign, record and ask once for home-currency amount as settled.

   If any required field (vendor / date / total) unextractable, stop and ask ONE targeted question. Never guess.

4. **Canonicalize party**  -  same recipe as `categorize-my-transactions`: strip noise prefixes and reference numbers, Title Case. Fuzzy-match (token-set ratio ≥ 0.85) against `prior-categorizations` / `party-rules`; prefer stored key as canonical form.

5. **Pick account code.** Priority order:
   1. Exact match in `party-rules` → `confidence: 1.00`, `source: "rule"`.
   2. Fuzzy match in `prior-categorizations` (ratio ≥ 0.85, stored code in chart of accounts) → `confidence: 0.95`, `source: "prior_year"`.
   3. Reason against locked chart of accounts via vendor + description + line items + amount + founder context (travel vs. office vs. R&D contractor). Confidence `≥ 0.90` → `source: "ai"`.
   4. Else → Suspense (`glCode = universal.suspenseCode.code`, confidence `0.50`, `category_status: "uncategorized"`).

   Never invent account codes. If receipt has clearly separable lines (e.g., meals + hotel on one hotel folio), split into multiple debit lines.

6. **Draft journal entry.** Balanced double-entry, one per receipt:
   - **Debits**  -  categorized expense line(s) by `glCode`.
   - **Credit**  -  determined by `paymentMethod`:
     - `corp card {last4}` → credit card's account (`context-ledger.domains.banks.accounts[].glCode` for that last4). Note: later dedupes against card feed  -  flag `supportingDocs` so `reconcile-my-accounts` catches double-book.
     - `personal card` / `cash` / reimbursed → credit `Founder Loan Payable` (look up in chart of accounts; ask ONCE to register if absent).
     - `ACH` from another entity → credit `Due to Related Party` or `Founder Loan Payable`, whichever applies.
   - Memo: `"{vendor}  -  {date}  -  {short description}"`.
   - Every `glCode` validated against `config/chart-of-accounts.json`.
   - `sum(debits) === sum(credits)` within 1 cent.
   - `status: "draft"`, `reversing: false`, `period` = `YYYY-MM` of receipt date.

7. **`mode=batch` branch.** If triggered:
   - Do Steps 2–5 for every receipt in batch.
   - Produce per-receipt expense markdown (Step 8) for traceability.
   - Produce ONE summary journal entry: one debit line per unique account code (summed across receipts), one credit:
     - `Accrued Reimbursements` if receipts same-period and reimbursement not yet done.
     - `Founder Loan Payable` if founder floated expenses (common pre-seed).
   - `supportingDocs[]` lists every per-receipt markdown path.
   - Memo: `"Founder reimbursement batch  -  {N} receipts  -  {period}"`.

8. **Write per-receipt expense doc** to `expenses/{YYYY-MM-DD}-{vendor-slug}.md`. Structure:
   - Header: vendor, date, amount, payment method, confidence, source.
   - Line items table (if itemized).
   - **Journal entry (draft)**  -  balanced entry inline, markdown table `{glCode | glName | debit | credit | memo}`.
   - Attached receipt path (copied into `expenses/_attachments/` on first sight).
   - Open questions (if any field asked inline).

9. **Update indexes**  -  all read-merge-write, atomic (`.tmp` + rename):
   - `journal-entries.json` at agent root  -  append journal entry with full schema from `data-schema.md` (`id, date, type: "adjustment" | "reclass", memo, reversing: false, period, lines[], status: "draft", supportingDocs[]`).
   - If category lands in Suspense, append to `suspense.json`.
   - `outputs.json`  -  one row per receipt `{type: "expense-receipt", title, summary, path, status: "draft", domain: "transactions"}`. In batch mode, also append summary row `{type: "journal-entry", title: "Reimb batch {period}", ...}`.

10. **Summarize to user.** One compact block:
    - Receipt count, total dollars, bucket split (categorized / Suspense).
    - Account code histogram (top 3 codes with amounts).
    - Path(s) to expense doc(s) and drafted journal entries.
    - Reminder: journal entry is `draft`  -  user posts to QuickBooks Online / Xero.

## Outputs

- `expenses/{YYYY-MM-DD}-{slug}.md`  -  one file per receipt (batch mode too, for traceability).
- `expenses/_attachments/`  -  receipt files copied from `_inbox/` or Composio fetch.
- `journal-entries.json`  -  read-merge-write, journal entry appended at `status: "draft"`.
- `suspense.json`  -  only if any line hit Suspense.
- `outputs.json`  -  one row per receipt + summary row in batch mode.