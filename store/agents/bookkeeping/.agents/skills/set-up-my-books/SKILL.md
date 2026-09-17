---
name: set-up-my-books
description: "Set up your books from scratch with one founder interview that captures entity, fiscal year, accounting method, registered accounts, payroll posture, revenue model, investor cadence, and tax preparer, then writes the live bookkeeping brief every other skill reads first. Sub-mode `mode=opening-balances` captures your opening trial balance from a spreadsheet, CSV, or prior-accountant export. I never connect a bank, post to a general ledger, or move money from this skill — facts and a brief, full stop."
version: 1
category: Bookkeeping
featured: yes
image: ledger
integrations: [stripe]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Set Up My Books

The one-time founder interview that anchors every other thing I do. I write your bookkeeping brief — entity type, fiscal year, cash vs. accrual, bank accounts, payroll, revenue model, investor cadence, tax preparer — and capture an opening trial balance if you have one. Every other skill reads the brief first and refuses substantive work without it.

Drafts and facts only: I never file, post to your general ledger, or connect to a bank from this skill.

## When to use

- "set up the books" / "onboard us" / "draft the bookkeeping brief".
- "update the bookkeeping context" / "our fiscal year changed" / "we switched to accrual in June".
- `mode=opening-balances`  -  "capture our opening trial balance" / "load our starting balances from this spreadsheet" / "book the opening trial balance from our prior accountant".
- Called implicitly by another skill that needs the brief and finds it missing  -  only after confirming inline with you.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Stripe** (billing) — optional, lets me confirm your revenue model and contract source automatically.
- **Bank feed** (Plaid-backed banking) — optional, fastest way to register your bank accounts and credit cards.

This skill is mostly an interview, so no connection blocks the run. Connections just save you from typing things out.

## Information I need

I read your bookkeeping context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Company basics: legal name, entity type, state, EIN, fiscal year end, stage, industry** — Required. Why: shapes equity section, fiscal calendar, and tax footprint. If missing I ask each in turn, one at a time, e.g. "What's the company's legal name on the filing paperwork?"
- **Cash vs. accrual accounting** — Required. Why: drives whether I include accruals, deferred revenue, and prepaid amortization. If missing I ask: "Are we keeping the books on cash or on accrual? If you switched mid-year, when did the switch happen?"
- **Bank accounts, credit cards, and payment processors** — Required. Why: every account I track needs a name, last 4 digits, and bank. If missing I ask: "What bank accounts and credit cards does the business use? Connecting your bank feed is easiest."
- **Payroll provider and team size** — Required if you have employees. Why: drives accrued payroll and stock-comp lines. If missing I ask: "Who runs payroll, Gusto, Rippling, Justworks, someone else, or no employees yet? And roughly how many people are on the team?"
- **Revenue model** — Required. Why: subscription, usage, services, or mix changes which revenue lines exist. If missing I ask: "How does the business make money, recurring subscriptions, usage-based, services, or a mix?"
- **Tax preparer name and email** — Optional. Why: drops automatically into year-end tax handoffs. If you don't have one yet I keep going and ask later.
- **An opening trial balance, in `mode=opening-balances`** — Required for that mode. Why: anchors every balance sheet number going forward. If missing I ask: "Do you have a closing trial balance from your prior books or accountant? Drop it as a spreadsheet or CSV with account code, name, debit, and credit."

## Steps
<!-- houston-workflow:v1 -->

1. **Read existing state.** Load `config/context-ledger.json` (create empty scaffold `{"universal":{},"domains":{}}` if absent) and `context/bookkeeping-context.md` if exists  -  this run is update, not rewrite. Preserve anything founder sharpened; touch only stale or new.

2. **Determine mode.** Default = full brief. If user triggered `mode=opening-balances`, skip to Step 6.

3. **Collect missing (one targeted question per gap).** For each required ledger field not set, ask ONE question with modality hint (connected app > file > URL > paste) and write answer atomically before moving on. Required fields for full brief:

   - `universal.company`  -  legal name, DBA, entity type (c-corp / s-corp / llc / partnership / sole-prop), EIN, state of incorporation, fiscal year end (`MM-DD`), founded date, stage (pre-seed / seed / series-a / series-b / growth), industry.
   - `universal.accountingMethod`  -  `cash` or `accrual`; if switched mid-year, capture `switchedOn` (YYYY-MM-DD).
   - `universal.suspenseCode`  -  default `{"code":"99999","name":"Suspense"}` unless founder's prior chart of accounts uses different code.
   - `domains.banks.accounts[]`  -  per bank account, credit card, Stripe, payment processor: `last4`, `type`, `bank`, `glCode` (blank OK if chart of accounts doesn't exist yet), `glName`. Prefer Composio connection (Plaid / banking category) over manual list.
   - `domains.payroll`  -  provider (gusto / rippling / justworks / deel / adp / none), cadence, `teamSize`, `stockCompPosture` (iso / nso / rsu / mix / none).
   - `domains.revenue`  -  `model` (saas-subscription / usage / services / marketplace / mix), `asc606` posture, `contractSource`.
   - `domains.investors`  -  cadence, `anchorKpis[]` (e.g., annual revenue, Gross Margin, Burn, Runway), `format`.
   - `domains.tax`  -  `preparerName`, `preparerEmail`, `lastYearFiled`, `rdCreditEligible` (yes / no / tbd), `stateFilingFootprint[]`.

   Per field written, stamp `capturedAt` (ISO-8601 UTC) and `source` where schema asks. If founder says "TBD" or "not yet", record `null` and note in brief to re-ask later  -  but NEVER ask same field twice in one run.

4. **Capture founder-specific hard nos.** One open question: "any things I should never touch without explicit sign-off?" Common: stock-based comp (no 409A input), revenue recognition on non-standard contracts, related-party transactions, crypto. Record verbatim.

5. **Draft brief (~400-700 words, opinionated, direct).** Structure, in order:

   1. **Company overview**  -  one paragraph: legal name, entity type, state, EIN, fiscal year, stage, industry.
   2. **Accounting posture**  -  method (cash / accrual), framework (GAAP-startup / IFRS / tax-basis), mid-year switches with date.
   3. **Bank accounts & cards**  -  grouped by `last4`; each with bank, type, account code, account name. Flag account without account code as `TBD  -  set when chart of accounts exists`.
   4. **Revenue model**  -  subscription / usage / services posture; ASC 606 treatment; contract location.
   5. **Payroll posture**  -  provider, cadence, team size, stock-comp plan type.
   6. **Compliance footprint**  -  state-filing list, R&D credit posture, sales-tax exposure notes.
   7. **Investor cadence**  -  monthly / quarterly / none; anchor KPIs; preferred format.
   8. **Tax preparer**  -  name, email, last year filed.
   9. **Hard nos**  -  workspace-level ("never post to the general ledger, never move money, never file anything") + founder-specific.

   Thin sections: mark `TBD  -  {what to bring next}` and move on. Never invent.

6. **`mode=opening-balances` branch.** If triggered:

   - User dropped file: parse xlsx with `openpyxl`, CSV with stdlib `csv` module. Column map: accept `{code|account_code, name|account_name, debit, credit}` or `{code, name, balance}` where positive = debit and negative = credit (confirm sign convention inline if ambiguous).
   - User typing inline: accept `{glCode, debit, credit}` rows.
   - Validate every `glCode` exists in `config/chart-of-accounts.json`. If chart of accounts absent, stop and ask user to run `build-my-chart-of-accounts` first (or run inline). NEVER invent account code here.
   - Validate `sum(debit) === sum(credit)` within 1 cent. If unbalanced, surface diff and stop  -  do NOT plug.
   - Write `config/opening-trial-balance.json` atomically as `[{glCode, debit, credit}]`.
   - Update `config/context-ledger.json → universal.openingBalances` with `{asOf, source, trialBalancePath, capturedAt}`.

7. **Write atomically.** Every write: target `{path}.tmp`, then `rename`. Files touched this run:
   - `context/bookkeeping-context.md` (always)
   - `config/context-ledger.json` (read-merge-write  -  never overwrite)
   - `config/opening-trial-balance.json` (only in opening-balances mode)

8. **DO NOT append to `outputs.json`.** Brief is live document, not deliverable. Opening trial balance is config, not output. Neither indexed.

9. **Summarize to user.** One short paragraph: what captured, what still TBD, exact next move (usually: "run `build-my-chart-of-accounts` next, then drop bank statements into `statements/_inbox/`").

## Outputs

- `context/bookkeeping-context.md`  -  live bookkeeping brief (at agent root; never under `.agents/` or `.houston/`).
- `config/context-ledger.json`  -  merged with newly captured fields.
- `config/opening-trial-balance.json`  -  only when `mode=opening-balances` triggered.

No entries in `outputs.json` by design.