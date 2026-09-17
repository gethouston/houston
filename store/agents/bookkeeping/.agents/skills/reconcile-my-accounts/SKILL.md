---
name: reconcile-my-accounts
description: "Reconcile a single account — bank, credit card, payment processor, or subledger — for the period you pick. I tie the general ledger one side, the external statement the other, surface unmatched items aged into 0–30 / 31–60 / 61–90 / >90 day buckets, and render a three-way proof with the real numbers. Sub-mode `mode=transfer-detect` finds debit/credit pairs across all your accounts within ±2 days and tags them as Internal Transfers so they fall out of the P&L. I never silently plug a difference and I never force-match in QuickBooks Online or Xero."
version: 1
category: Bookkeeping
featured: no
image: ledger
integrations: [stripe, quickbooks, xero]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Reconcile My Accounts

A three-way reconciliation on one account for one period. General ledger balance on one side, external statement or feed on the other, unmatched items aged in the middle. Every difference is either explained by a timing item, surfaced as an unmatched item, or escalated as a named break. I never silently plug.

Drafts only: I never adjust your general ledger, never force-match in QuickBooks Online or Xero. I write the reconciliation doc and surface the breaks.

## When to use

- "reconcile January's Chase checking" / "reconcile Amex 9041 for
  March" / "reconcile Stripe for Q1".
- "why is the general ledger off the bank by $X" / "what's in the outstanding
  check list".
- Called by `close-my-month` for every account in
  `context-ledger.domains.banks.accounts[]` for close period.
- `mode=transfer-detect`  -  "find the transfers across accounts for
  March" / "tag the internal transfer pairs so they fall out of
  P&L". Runs across all accounts at once, not single account.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **QuickBooks Online or Xero** (accounting) — preferred source for the general ledger register on this account. Required if you want me to pull general ledger activity directly.
- **Bank feed** (Plaid-backed banking) — preferred source for the bank-side activity to compare against. Optional, you can also drop the statement PDF.
- **Stripe** (billing) — required only if reconciling Stripe; pulls balance transactions for the period.

If neither accounting nor banking is connected I fall back to a dropped CSV / PDF. If you have nothing to share I stop and ask you to connect one or drop the period statement.

## Information I need

I read your bookkeeping context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **The account to reconcile and the period** — Required. Why: tells me which last-4 to look up and which date range to pull. If missing I ask: "Which account do you want reconciled, and for which month or quarter?"
- **A registered list of bank accounts and credit cards** — Required. Why: I look up bank, type, and account code by last 4. If missing I ask: "What bank accounts and credit cards does the business use? Connecting your bank feed is easiest."
- **A chart of accounts** — Required. Why: I map the account's account code into the right cash or liability line. If missing I ask: "Do we have a chart of accounts yet? If not, let's draft one first."
- **The bank or processor side for the period** — Required. Why: I need both sides for the three-way proof. If missing I ask: "Can you connect the bank feed or QuickBooks, or drop the statement PDF or CSV for this period?"

## Steps
<!-- houston-workflow:v1 -->

1. **Parse inputs.** Required: `account_last4` (or `all` for
   `mode=transfer-detect`) and `period` (`YYYY-MM` or `YYYY-QN`).
   Resolve `{periodStart, periodEnd}` from period slug.

2. **Read context.** Load `context/bookkeeping-context.md` (stop if
   missing  -  ask user to run `set-up-my-books`
   first), `config/context-ledger.json`, and
   `config/chart-of-accounts.json`.

3. **Identify account.** Look up `account_last4` in
   `context-ledger.domains.banks.accounts[]`. Capture `{bank, type,
   glCode, glName}` (account code and account name). If account not registered, ask ONE
   targeted question to register  -  never guess.

4. **`mode=transfer-detect` branch.** If triggered:
   - Pull all txns across all registered accounts for period.
     Source order: connected app (QuickBooks Online / Xero / bank feed
     via Composio  -  discover slug with `composio search accounting`
     / `composio search banking`) > `runs/{period}/run.json` if
     present > CSV drop.
   - Pair detection: for each debit in account A on date D, search
     all other accounts for credit with same absolute amount
     on date `D ± 2 days`. Amount tolerance: 1 cent.
   - Tag both legs `glCode = "9000"`, `glName = "Internal
     Transfer"`, `source = "transfer"`. Excluded from
     P&L SUMIFS downstream.
   - Write pair list to
     `reconciliations/_transfers/{period}.md` with each pair's
     `{date_a, account_a, date_b, account_b, amount, confidence}`.
   - Append one-line note to every affected account's recon doc
     if already exist.
   - Skip to Step 10.

5. **Pull two sides.**
   - **General ledger side**  -  preferred via connected app: `composio search
     accounting`, pick QuickBooks Online / Xero slug, pull general ledger register
     for `{glCode, periodStart, periodEnd}`. Discover schema with
     `--get-schema`; never hardcode. Fall back to CSV / paste
     if unconnected.
   - **External side**  -  bank / CC / Stripe:
     - Bank / CC: `composio search banking` (Plaid-backed) or
       `statements/{account_last4}/{YYYY-MM}.pdf` if already
       dropped during `process-my-statements` run.
     - Stripe: `composio search billing`, pull balance transactions
       for period.
     - Subledger: accept CSV with `{date, description, amount}`
       plus opening + closing balances.

6. **Match items.** Exact match on `(date, amount)` first; then
   `(amount, date ± 2 days)` tolerance. Description similarity
   (token-set ratio ≥ 0.75) breaks ties when multiple candidates
   tie on amount. Confidence thresholds:
   - `≥ 0.95`  -  auto-match (exact).
   - `0.80–0.94`  -  tentative match, surface in review bucket.
   - `< 0.80`  -  unmatched.

7. **Classify unmatched items.**
   - **In general ledger, not on statement**  -  candidates for outstanding
     checks (if account checking and amount negative),
     deposits in transit (positive), or erroneous general ledger entry. Age
     each: `daysOld = runDate - transactionDate`.
   - **On statement, not in general ledger**  -  candidates for unrecorded
     fees / interest / subscription charges. Usually become
     journal entry suggestion for `draft-a-journal-entry type=adjustment`.
   - **Amount differences**  -  same party + same date, different
     amount. Flag each with delta.

8. **Compute three-way proof.**
   ```
   gl_ending_balance
     + (on statement, not in general ledger)
     - (in general ledger, not on statement)
     ± amount_differences
     = statement_ending_balance    (within 1 cent)
   ```
   If proof doesn't land within 1 cent, **do NOT plug**. Flag
   named break in report and upsert to `recon-breaks.json` with
   `status: "unresolved"`.

9. **Age unmatched items.** Bucket each into `0-30d`, `31-60d`,
   `61-90d`, `>90d`. Items `> 90d` old escalate  -  flag in
   report header.

10. **Write reconciliation doc** to
    `reconciliations/{account_last4}/{YYYY-MM}.md`. Structure:
    - Header: account (bank / type / last4), period, general ledger balance,
      statement balance, computed difference, status
      (`clean` / `has-items` / `unresolved-break`).
    - **Three-way proof**  -  equation above rendered with real
      numbers.
    - **Outstanding items**  -  table grouped by direction (general-ledger-side
      vs. statement-side), with `{date, description, amount,
      daysOld, ageBucket}`.
    - **Amount differences**  -  table with `{date, party, glAmount,
      statementAmount, delta}`.
    - **Tentative matches**  -  table for human review
      (confidence 0.80–0.94).
    - **Suggested adjustments**  -  list of candidate journal entries for
      `draft-a-journal-entry type=adjustment` (unrecorded fees,
      interest, forex rounding).
    - **Named breaks**  -  only if three-way proof failed. One
      line per break with dollar amount and best-guess cause.

11. **Update indexes.**
    - `recon-breaks.json` (flat at agent root)  -  read-merge-write.
      For each unresolved item upsert
      `{id, accountLast4, period, date, description, amount,
      direction, daysOld, status, addedAt, updatedAt}`. Age-update
      existing entries rather than duplicate.
    - `outputs.json`  -  append
      `{type: "reconciliation", title: "Recon {bank} {last4}
      {YYYY-MM}", summary, path, status: "draft", domain: "close"}`.

12. **Summarize to user.** Two-line recap: three-way proof
    result, and count + dollar total of unmatched items by age
    bucket. Include path to full doc.

## Outputs

- `reconciliations/{account_last4}/{YYYY-MM}.md`  -  full recon.
- `reconciliations/_transfers/{period}.md`  -  only in
  `mode=transfer-detect`.
- `recon-breaks.json`  -  read-merge-write, unresolved items aged.
- `outputs.json`  -  one row appended, `type: "reconciliation"`.