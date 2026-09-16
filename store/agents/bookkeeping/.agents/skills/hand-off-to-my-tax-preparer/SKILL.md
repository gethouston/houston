---
name: hand-off-to-my-tax-preparer
description: "Assemble the year-end package for your tax preparer. I gate on a clean audit (`audit-my-books` runs first; open items block the handoff), then put together the trial balance, per-account reconciliations, fixed-asset and depreciation schedules, 1099 list, R&D classification (if eligible), M-1 adjustment candidates (meals 50% / 100% disallowance, stock-based compensation book vs. tax timing, accrual-to-cash deltas, federal income tax, deferred revenue, non-deductibles), and a judgment-call audit trail. Optional Google Drive mirror shared with your preparer as commenter. Drafts email to your preparer — I never send and I never file."
version: 1
category: Bookkeeping
featured: no
image: ledger
integrations: [googledrive, gmail, outlook]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Hand Off to My Tax Preparer

Year-end tax handoff package. Gated by `audit-my-books` — books must
be clean first. Once clean, I assemble the full tax tie-out under
`handoffs/tax-{year}/`, optionally mirror it to Google Drive, and
draft the email to your preparer with the folder link. Never filed,
never sent.

## When to use

- "close the year for the tax preparer" / "prep the tax tie-out" /
  "hand off to our CPA" / "year-end package for tax".
- Run once per fiscal year, after final month's
  `close-my-month` completes.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Google Drive** (files) — optional, lets me mirror the entire handoff folder into a shared location your tax preparer can view. If not connected I keep the package local.
- **Gmail or Outlook** (inbox) — optional, lets me create a draft email to your tax preparer with the package link. I never send. If not connected I write the email text to a draft file instead.

If you want both the Drive mirror and the email draft and neither is connected, I name both categories and ask you to link the one you'd rather have.

## Information I need

I read your bookkeeping context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **The fiscal year you're handing off** — Required. Why: defines the date range for trial balance and supporting schedules. If missing I ask: "Which tax year are we handing off, the most recently completed one?"
- **Tax preparer name and email** — Required. Why: drops into the cover memo and the email draft. If missing I ask: "Who's filing your return this year, name and email so I can address the package to them?"
- **Whether you're claiming the R&D credit** — Required. Why: if yes, I include the R&D classification in the package. If missing I ask: "Are you planning to claim the federal R&D credit this year, yes, no, or undecided?"
- **A capitalized fixed-asset list** — Optional. Why: drives the depreciation schedule. If you don't have any capitalized assets I skip that section. If missing I ask: "Do you have any capitalized fixed assets (laptops bought as assets, equipment, leasehold improvements)? If you don't have it I keep going without a depreciation schedule."
- **Clean monthly closes through year-end** — Required. Why: the handoff is gated on books being clean; open recon breaks and uncategorized items have to close first. If missing I ask: "Have we closed every month of the fiscal year yet? If not, let's finish those first, otherwise the handoff has too many open items."

## Steps
<!-- houston-workflow:v1 -->

1. **Read context.** Load `context/bookkeeping-context.md`,
   `config/context-ledger.json`, `config/chart-of-accounts.json`.
   Required ledger: `universal.company` (legal name, EIN, entity
   type, fiscal year), `universal.accountingMethod`,
   `domains.tax.preparerName`, `domains.tax.preparerEmail`,
   `domains.tax.rdCreditEligible`. Ask for missing preparer
   contact (file > paste) and cache.

2. **Determine tax year.** If specified, use it; else default to
   most recently completed fiscal year per
   `universal.company.fiscalYearEnd`.

3. **Gate  -  run `audit-my-books` first.** Invoke `audit-my-books`
   skill for period ending fiscal-year-end. If findings remain
   (suspense, recon breaks > $100 age > 30 days, stale accruals,
   stuck draft journal entries, cutoff candidates, opening-balance gaps,
   high-priority vendor merges), STOP. Surface blocker list with
   audit path; ask user to close each (or explicitly confirm each
   immaterial). Do not proceed until user clears gate.

4. **Trial balance.** Invoke `prepare-my-financials` with
   `statement=trial-balance` and `as-of = fiscal year-end`. Write
   to `handoffs/tax-{year}/trial-balance.md`. Must balance within
   1 cent.

5. **Reconciliation summaries.** For each account in
   `domains.banks.accounts[]`, copy final monthly recon from
   `reconciliations/{account_last4}/{YYYY-MM}.md` into handoff
   folder, plus one roll-up per account at
   `handoffs/tax-{year}/reconciliations/{account_last4}.md`
   (opening → monthly activity → ending → unmatched items  -
   should be empty or documented from audit gate).

6. **Fixed-asset schedule.** Read `config/fixed-assets.json`
   (absent → ask user if any capitalized assets exist; if none,
   skip). Include per asset: in-service date, acquisition cost,
   method (SL / MACRS class), useful life, accumulated
   depreciation to year-end, net book value. Write to
   `handoffs/tax-{year}/fixed-asset-schedule.md`.

7. **Depreciation schedule.** Compute full-year straight-line
   from fixed-asset schedule (half-year convention default; note
   at top). Write to
   `handoffs/tax-{year}/depreciation-schedule.md`. Book
   depreciation only  -  tax depreciation (MACRS, §179, bonus) is
   preparer's computation.

8. **1099 list.** Invoke `prep-my-1099s` for tax year (skip
   email-drafting step if already run). Copy
   `compliance/1099s/{year}.md` → `handoffs/tax-{year}/1099-
   list.md`.

9. **R&D classification (if eligible).** If
   `domains.tax.rdCreditEligible == "yes"`, invoke
   `tag-my-rd-spend` for year and copy
   `compliance/rd-credit/{year}.md` →
   `handoffs/tax-{year}/rd-classification.md`. Else skip with
   one-liner in cover memo.

10. **M-1 adjustment candidates.** Write
    `handoffs/tax-{year}/m1-adjustments.md` listing common
    book/tax differences with amounts from books:
    - **Meals**  -  50% disallowance on restaurant meals; 100%
      disallowance on most other meals post-2023. Split by memo
      where possible; flag `TBD` otherwise.
    - **Stock-based compensation**  -  book stock-based compensation expense vs. tax
      timing (tax deducts at exercise / vest per plan).
    - **Accrual-to-cash differences**  -  if returning on cash
      basis while books accrual, list accrued-liability + accounts receivable
      balances at year-end. Skip if both accrual.
    - **Federal income tax expense**  -  book deduction, tax
      add-back.
    - **Unearned revenue**  -  deferred-revenue balance at
      year-end (cash basis picks up differently).
    - **Other non-deductibles**  -  penalties, fines, entertainment
      (post-TCJA), political contributions.
    Each row: book amount, direction (add-back / deduction),
    memo. Flag every judgment call  -  preparer finalizes.

11. **Judgment-call notes.** Walk `outputs.json` for fiscal year
    and collect every "judgment-call" callout (from
    `schedule-my-revenue`, `tag-my-rd-spend`,
    `draft-a-journal-entry type=stock-comp`, etc.). Write to
    `handoffs/tax-{year}/judgment-calls.md` with per-item
    entries: what decided, by whom, when, alternatives
    considered. Preparer's audit trail.

12. **Cover memo.** `handoffs/tax-{year}/cover-memo.md`  -  one
    page. Company block (legal name, EIN, entity type, state,
    fiscal year-end); accounting posture; package contents
    (bulleted with links); book net income; top 3–5 items for
    preparer's attention; open TBDs; signoff line.

13. **Optional Google Drive mirror.** If `composio search files`
    returns connected Drive slug: create folder `Tax Handoff
    {YYYY}  -  {Legal Name}`, upload every file from
    `handoffs/tax-{year}/` preserving subfolders, share with
    `domains.tax.preparerEmail` as commenter (never editor).
    Capture URL in cover memo header. Skip silently if Drive not
    connected.

14. **Draft preparer email.** If `composio search inbox` returns
    connected Gmail / Outlook slug, create inbox draft (never
    send) to `domains.tax.preparerEmail`, subject `"{Legal Name}
    {YYYY} tax handoff package"`, body referencing cover memo +
    Drive URL (or local folder path) with short summary of
    package and major items. Save draft id/URL in cover memo
    under "Draft email to preparer". If no inbox connection,
    write email text to `drafts/tax-preparer-handoff-{year}.md`.

15. **Append to `outputs.json`.** Row:
    `{type: "tax-handoff", title: "Tax handoff {year}", summary,
    path: "handoffs/tax-{year}/cover-memo.md", status: "draft",
    domain: "compliance"}`. Read-merge-write. Flip to `ready`
    when user confirms review; `posted` only when they confirm
    sent to preparer.

16. **Summarize to user.** One paragraph: package at
    `handoffs/tax-{year}/`, components included, book net income,
    remaining TBDs, Drive URL (if mirrored), email draft id /
    path, reminder I never send  -  they review and send.

## Outputs

- `handoffs/tax-{year}/cover-memo.md` (indexed as `tax-handoff`)
- `handoffs/tax-{year}/trial-balance.md`
- `handoffs/tax-{year}/reconciliations/{account_last4}.md` (one
  per account)
- `handoffs/tax-{year}/fixed-asset-schedule.md`
- `handoffs/tax-{year}/depreciation-schedule.md`
- `handoffs/tax-{year}/1099-list.md`
- `handoffs/tax-{year}/rd-classification.md` (if eligible)
- `handoffs/tax-{year}/m1-adjustments.md`
- `handoffs/tax-{year}/judgment-calls.md`
- Optional Google Drive folder mirror (URL in cover memo)
- Inbox draft to tax preparer (never sent)