---
name: categorize-my-transactions
description: "Categorize a batch of pending transactions from your QuickBooks or Xero queue, a dropped CSV, or a pasted table. I canonicalize each party, apply your saved rules first, then prior-year memory, then calibrated reasoning against your locked chart of accounts; anything below 0.90 confidence lands in Suspense rather than getting silently pushed through. Sub-mode `mode=rule-add` upserts a permanent `{party: gl_code}` rule after verifying the account code exists. Drafts only — I never post to QuickBooks or Xero, I never invent an account code."
version: 1
category: Bookkeeping
featured: yes
image: ledger
integrations: [stripe, quickbooks, xero]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Categorize My Transactions

The ongoing companion to the statements pipeline: I take pending transactions from your QuickBooks or Xero queue, a CSV, or a pasted table, and produce a review-ready batch grouped into Ready, Needs Review, and Suspense. Two invariants: your chart of accounts is locked for the run, and anything below 0.90 confidence goes to Suspense rather than silent pushthrough.

Drafts only: I categorize, flag, and write the review batch. You or your accountant post to QuickBooks or Xero.

## When to use

- "categorize these pending transactions" / "review QuickBooks Online's pending queue" / "clean up Xero's uncategorized tray".
- Fresh CSV of pending items dropped at agent root or `transactions/_inbox/`.
- `mode=rule-add`  -  "make 'Stripe Fee' always go to 6700 going forward" / "lock 'AWS' to 6210 so you stop asking".
- Called by `process-my-statements` at end-of-run for rows that came out `uncategorized`  -  optional handoff.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **QuickBooks Online or Xero** (accounting) — preferred source for the live pending / uncategorized queue. Required if you want me to pull pending items directly.
- **Stripe** (billing) — optional, helps me categorize processor fees and payouts when they show up in the queue.

If no accounting tool is connected I fall back to a dropped CSV or pasted table. If you have nothing to share I stop and ask you to connect QuickBooks or Xero, or drop a CSV of pending items.

## Information I need

I read your bookkeeping context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **A chart of accounts** — Required. Why: I lock it during the run; every category I assign has to come from your chart of accounts, never invented. If missing I ask: "Do we have a chart of accounts yet? If not, let's draft one first, it only takes a few minutes."
- **A finished bookkeeping context** — Required. Why: I need your accounting method, suspense code, and registered accounts to categorize correctly. If missing I ask: "Have we set up the books yet? If not, run the setup once so I know your fiscal year, accounting method, and registered accounts."
- **The pending transactions to review** — Required. Why: I can't categorize what I can't see. If missing I ask: "Where are the pending transactions, in QuickBooks or Xero, in a CSV you can drop, or pasted into chat?"
- **Vendor rules from a prior period** — Optional. Why: lets me match new charges to known vendors and skip asking you the same question twice. If you don't have it I keep going and learn from this run.

## Steps
<!-- houston-workflow:v1 -->

1. **Read context & lock the chart of accounts.** Load:
   - `context/bookkeeping-context.md`  -  if missing, stop, ask user to run `set-up-my-books` first.
   - `config/context-ledger.json`  -  accounts, suspense code, connected accounting slug hints.
   - `config/chart-of-accounts.json`  -  **lock it** for run. If absent, stop, ask user to run `build-my-chart-of-accounts` first. Never invent codes mid-run.
   - `config/prior-categorizations.json`  -  vendor → account code memory (empty object if absent).
   - `config/party-rules.json`  -  exact-match rules (empty object if absent).

2. **Resolve pending list.** Priority order:
   - **Connected app** (preferred): `composio search accounting`, pick QuickBooks Online / Xero slug, pull current pending / uncategorized queue. Discover schema with `--get-schema`; never hardcode. If no connection, surface one-shot link command.
   - **File drop**: CSV at `transactions/_inbox/*.csv`  -  parse with stdlib `csv`. Required columns `{date, description, amount}`; optional `{account_last4, statement_date, party}`.
   - **Paste**: inline table in user's message.

3. **`mode=rule-add` branch.** If triggered:
   - Expect `{canonical_party, gl_code}` pairs (inline or file).
   - Per pair, validate `gl_code` exists in `config/chart-of-accounts.json`. If not, reject pair with named error  -  NEVER invent account codes.
   - Read-merge-write `config/party-rules.json`: upsert `{canonical_party: gl_code}`. Atomic write (`.tmp` + rename).
   - Report one line per upsert; skip rest of skill.

4. **Canonicalize parties.** Per pending row, derive canonical party name same way `process-my-statements` does: strip noise prefixes (`POS DEBIT`, `CHECKCARD`, `ACH`, `SQ *`, `TST*`, `ONLINE PMT`), strip trailing reference numbers and city/state suffixes, collapse whitespace, Title Case. If cleaned name fuzzy-matches key in `prior-categorizations` or `party-rules` (token-set ratio ≥ 0.85), use stored key as canonical form.

5. **Categorize each transaction.** Priority order  -  stop at first hit:

   1. **`party-rules` exact match** → account code from rule, `confidence: 1.00`, `source: "rule"`.
   2. **`prior-categorizations` fuzzy match** (token-set ratio ≥ 0.85 AND stored account code exists in chart of accounts) → stored account code, `confidence: 0.95`, `source: "prior_year"`.
   3. **Reasoning against chart of accounts**  -  pick best line from locked chart of accounts using description + canonical party + amount + account type. Assign calibrated confidence:
      - `≥ 0.95`  -  obvious, unambiguous.
      - `0.90–0.94`  -  one reasonable candidate, not certain.
      - `< 0.90` → Suspense (next rule). `source: "ai"`.
   4. **Suspense**  -  `glCode` = `universal.suspenseCode.code`, `confidence: 0.50`, `source: "ai"`, `category_status: "uncategorized"`.

   `category_status` rules:
   - `ready_for_approval` if `confidence ≥ 0.90` AND `source ∈ {rule, prior_year}`.
   - `review_categorization` if `confidence ≥ 0.90` AND `source = "ai"`.
   - `uncategorized` if `confidence < 0.90`.

   Never invent account code not in locked chart of accounts.

6. **Write review batch** to `transactions/{YYYY-MM-DD}.md` (run date, not txn date). Structure:
   - Header: run date, source (app slug / CSV path), total count, total absolute dollar volume.
   - **Ready for approval**  -  table grouped by account code, each row `{date | party | description | amount | glCode | glName | confidence | source}`.
   - **Needs review**  -  same table, one row per `review_categorization` item; include one-line "why this code" rationale.
   - **Suspense**  -  same table for `uncategorized` items, sorted desc by `abs(amount)`.
   - **Suggested party-rule upserts**  -  any canonical party appearing ≥ 3x this run with same AI-picked account code and confidence ≥ 0.90. Rendered as ready-to-run `mode=rule-add` JSON so user approves in one step.

7. **Persist learnings** (only after user confirms `ready_for_approval` bucket, or end-of-run if no confirmation gate). Read-merge-write `config/prior-categorizations.json`: upsert `{canonical_party: gl_code}` for every row with `source ∈ {rule, prior_year}` OR `confidence ≥ 0.95`. NEVER persist `confidence < 0.90` items  -  poison next run.

8. **Update Suspense index.** Per `uncategorized` item, read-merge-write `suspense.json` at agent root with `{id, date, party, description, amount, addedAt}`. Bump `updatedAt` on existing entries; no duplicates.

9. **Append to `outputs.json`.** One row: `{type: "categorization", title: "Categorization batch {YYYY-MM-DD}", summary, path, status: "draft", domain: "transactions"}`. Read-merge-write; never overwrite array.

10. **Summarize to user.** One short block: counts by bucket, total Suspense dollars (flag prominently), new parties added, suggested party-rule upserts with exact command to approve.

## Outputs

- `transactions/{YYYY-MM-DD}.md`  -  review-ready categorized batch.
- `config/prior-categorizations.json`  -  read-merge-write; upserted with this run's high-confidence vendor memory.
- `config/party-rules.json`  -  only in `mode=rule-add`, read-merge-write with verified upserts.
- `suspense.json`  -  read-merge-write with new uncategorized items.
- `outputs.json`  -  one row appended, `type: "categorization"`.