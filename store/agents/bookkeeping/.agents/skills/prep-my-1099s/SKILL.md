---
name: prep-my-1099s
description: "Prep your 1099-NEC and 1099-MISC list for the tax year. I total year-to-date payments per vendor from your run history, flag eligible vendors (non-corporate, ≥ $600), split NEC from MISC, cross-reference W-9 status against the W-9s you have on file, and draft chase emails for missing W-9s as Gmail / Outlook drafts (or as plain `.md` files if no inbox is connected). I prep, you file via IRS FIRE, Track1099, or Tax1099. I never file and I never send."
version: 1
category: Bookkeeping
featured: no
image: ledger
integrations: [gmail, outlook]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Prep My 1099s

1099-NEC and 1099-MISC prep for the tax year. I total payments per vendor from your run transactions, flag who's eligible, split NEC from MISC, cross-reference W-9 status, and draft chase emails for the missing W-9s. The chase emails sit in your Gmail or Outlook drafts (never sent) so you can review and click send. I prep — you file with the IRS.

## When to use

- "who are our 1099 vendors" / "prep the 1099 list for {year}".
- "draft chase emails for missing W-9s".
- Called by `hand-off-to-my-tax-preparer` as part of year-end package.
- Called in January for prior tax year (IRS deadline: Jan 31 for NEC).

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Gmail or Outlook** (inbox) — optional, lets me create draft chase emails directly to vendors with missing W-9s. I never send. If not connected I write the email text to a draft file you can copy.

This skill works fully offline against your run history. No connection blocks the run; the inbox connection just makes chase emails easier.

## Information I need

I read your bookkeeping context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **The tax year** — Required. Why: defines the date range for year-to-date payment aggregation. If missing I ask: "Which tax year are we prepping the 1099 list for? In January I default to the year that just ended."
- **Your company's legal name and EIN** — Required. Why: drops into the 1099 payer block on every form. If missing I ask: "What's the company's legal name and EIN as registered with the IRS?"
- **A current run history covering the tax year** — Required. Why: I aggregate vendor payments from your processed runs. If missing I ask: "Have we processed statements for the tax year yet? If not, drop the bank and credit card statements so I can categorize them first."
- **W-9s on file for your contractors** — Optional. Why: lets me mark each 1099 vendor as "have-w9" and skip the chase email. If you don't have them in one place I ask: "Do you have W-9s collected anywhere? If not, I'll flag every eligible vendor as missing and draft chase emails for each."
- **A vendor email list** — Optional. Why: lets me address chase emails to each vendor directly. If you don't have it I leave the recipient blank in each draft and ask you to fill it in.

## Steps
<!-- houston-workflow:v1 -->

1. **Read context.** Load `context/bookkeeping-context.md`, `config/context-ledger.json`, `config/chart-of-accounts.json`. Required ledger: `universal.company` (legal name + EIN for 1099 payer block), `domains.tax` (preparer name / email for cover note).

2. **Determine tax year.** User specified year → use it. Called in January no year → default to prior calendar year (`today.year - 1`)  -  that 1099 cycle. Called mid-year → use current year as running draft.

3. **Aggregate year-to-date payments per vendor.** Read every `runs/*/run.json` whose period overlaps tax year. Filter transactions to `amount < 0` (money out), group by `party` (canonical name). Sum absolute amounts per party within tax year date range. Cite every transaction by `(run period, date, amount)`  -  no invented payments.

4. **Exclude payments not 1099-reportable.**
   - Transfers (`gl_code == "9000"` / `source == "transfer"`).
   - Payments to corporations (S-corp / C-corp exempt except specific categories like attorney fees). Default-assume corporate if canonical party ends in `Inc`, `Corp`, `LLC` (W-9 confirms), `Corporation`, `Ltd`. Flag for user confirm  -  default exclude.
   - Payroll payments (go on W-2, not 1099).
   - Credit-card payments to vendor. Vendor paid exclusively via credit card → card issuer issues 1099-K  -  exclude from list. Flag any vendor paid only via credit card.
   - Reimbursements labeled pass-through.

5. **Apply 1099 eligibility thresholds.**
   - **1099-NEC**  -  contractors / services (account categories: professional services, contract labor, consulting, engineering contractors). Threshold: ≥ $600 year-to-date.
   - **1099-MISC**  -  rent, attorney fees (even if incorporated), prizes, medical payments, other. Threshold: ≥ $600 year-to-date.
   - Flag vendors straddling categories (e.g., law firm paid for both services and settlement)  -  user decides split.

6. **Cross-reference W-9 status.** Check `files/` (or user-provided vendor-W9 folder) for PDF matching each eligible vendor canonical name (fuzzy match, token-set-ratio ≥ 0.85). Record W-9 status per vendor: `have-w9` / `missing-w9` / `pending`. Vendor list with W-9 indicators provided at runtime → merge in.

7. **Draft chase emails for missing W-9s.** For every vendor flagged `missing-w9`:
   - Write `drafts/1099-chase-{vendor-slug}.md`  -  subject line, body, signature. Body references tax year, $ threshold, Form W-9 link (`https://www.irs.gov/pub/irs-pdf/fw9.pdf`), asks for return by specified date (default: Jan 15 for prior-year filing).
   - `composio search inbox` returns connected Gmail / Outlook slug → create inbox draft (never send) using vendor email if known from prior correspondence; include draft URL / id in `.md`. No connection → skip inbox step silently.
   - Cite canonical party, year-to-date paid, source run periods in draft body so user can verify before sending.

8. **Write `compliance/1099s/{year}.md`.** Atomic write. Structure:
   - **Payer block**  -  legal name, EIN, state.
   - **Summary**  -  NEC count, NEC $ total, MISC count, MISC $ total, missing-W-9 count.
   - **NEC recipients**  -  table: canonical party, year-to-date paid, account category breakdown, W-9 status, address (from W-9 if present; else `TBD`).
   - **MISC recipients**  -  same table shape.
   - **Excluded**  -  corporate exclusions, credit-card-only, payroll, transfers  -  one-line reason per row (so user can audit exclusions).
   - **Straddle cases**  -  vendors where NEC/MISC split needs judgment call, with options.
   - **Filing note**  -  "Prep only. File via IRS FIRE, Track1099, or Tax1099. Deadline: Jan 31 (NEC to recipient + IRS), Feb 28 paper / Mar 31 electronic (MISC to IRS)."

9. **Append to `outputs.json`.** Row: `{type: "vendor-1099-list", title: "1099 list {year}", summary, path: "compliance/1099s/{year}.md", status: "draft", domain: "compliance"}`. Read-merge-write.

10. **Summarize to user.** One paragraph: NEC count + $, MISC count + $, missing-W-9 count with chase-email paths, any straddle cases needing call, filing reminder ("I preplied  -  you file via FIRE / Track1099 / Tax1099"). Never file. Never send.

## Outputs

- `compliance/1099s/{year}.md` (indexed in `outputs.json` as `vendor-1099-list`)
- `drafts/1099-chase-{vendor-slug}.md` (one per missing W-9  -  not indexed; drafts)
- Optional inbox drafts in Gmail / Outlook via Composio (never sent)