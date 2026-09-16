---
name: build-my-chart-of-accounts
description: "Draft a startup-optimized chart of accounts shaped for your entity, accounting method, and revenue model — with R&D / Sales & Marketing / General & Admin operating expenses breakouts, deferred revenue and accrued PTO lines, SAFE-note and convertible equity lines, and one cash sub-line per registered bank account. Supports in-place revisions that preserve every unchanged code so historical categorizations don't silently reroute. I never push the chart of accounts to QuickBooks or Xero — you or your accountant mirror it in."
version: 1
category: Bookkeeping
featured: no
image: ledger
integrations: [hubspot, stripe, quickbooks, xero, notion, slack]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Build My Chart of Accounts

The chart of accounts is the shape of every financial statement I produce. I draft yours opinionated for early-stage startups: R&D visibility for the credit, Sales & Marketing / General & Admin split for gross-margin framing, accrual-ready liability lines even if you're on cash, and one cash sub-line per registered bank account so reconciliations map cleanly. Revisions land here only and preserve every unchanged code.

I never push the chart of accounts to QuickBooks or Xero. You or your accountant mirror it into the accounting system.

## When to use

- "draft our chart of accounts" / "we need one" / "we don't have
  one yet".
- "revise the chart of accounts to break out R&D" / "add a deferred-revenue line" /
  "split hosting out of cost of goods sold".
- Called implicitly by `import-my-prior-books` when prior export
  includes a chart of accounts and ours is missing.
- Called implicitly by `process-my-statements` Step 1 if chart of accounts absent  -
  but only after confirming inline.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **QuickBooks Online or Xero** (accounting) — optional, lets me read your existing chart of accounts from your accounting system as a starting point.
- **Stripe** (billing) — optional, helps me confirm how revenue and processor fees flow if you bill through Stripe.

This skill works fully offline against what you tell me. No connection blocks the run; connections just make the first draft more accurate.

## Information I need

I read your bookkeeping context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your entity type** — Required. Why: drives the equity section (C-corp gets common / preferred / APIC; LLC gets member capital). If missing I ask: "What's the entity type, C-corp, S-corp, LLC, or something else?"
- **Cash vs. accrual accounting** — Required. Why: shapes whether I include deferred revenue and accrued PTO lines by default. If missing I ask: "Are we keeping the books on cash or on accrual?"
- **Your bank accounts and cards** — Required. Why: I make one cash sub-line per bank account so reconciliations map cleanly. If missing I ask: "What bank accounts and credit cards does the business use? Connecting QuickBooks or your bank feed is the easiest way."
- **Your revenue model** — Required. Why: SaaS subscription, usage, services, or mix changes which revenue lines I include. If missing I ask: "How does the business make money, recurring subscriptions, usage-based, services, or a mix?"
- **Your stock-comp posture** — Optional. Why: ISO / NSO / RSU triggers a stock-based compensation expense line and APIC-SBC equity line. If missing I ask: "Do you grant equity to employees yet? If you don't have it I keep going without stock-comp lines and we add them later."

## Steps
<!-- houston-workflow:v1 -->

1. **Read config.** Load `config/context-ledger.json`. Required
   fields for good first-pass chart of accounts:
   - `universal.company.entityType` (drives equity section  -  c-corp
     gets common + preferred + APIC; LLC gets member capital).
   - `universal.accountingMethod` (cash-only can omit deferred-rev,
     accrued-PTO lines on request  -  default include so switch to
     accrual frictionless).
   - `domains.banks.accounts[]` (one Cash sub-line per bank account,
     named with last4 so reconciliations map 1:1).
   - `domains.revenue.model` (usage model gets Usage Revenue
     sub-line; services gets Services Revenue separate from
     recurring).
   - `domains.payroll.stockCompPosture` (non-"none" posture gets
     stock-based compensation expense + APIC-SBC equity lines).

   Any missing required field: ask ONE targeted question
   (modality hint: connected app > file > URL > paste), write
   atomically, continue.

2. **Read existing chart of accounts if present.** If
   `config/chart-of-accounts.json` exists, load it. This run =
   revision, not rewrite. **Preserve every code unchanged.**
   Propose diffs (adds / renames / reparents) and confirm with user
   before writing. Never reassign code from one name to different
   concept  -  silently reroutes every historical transaction that
   matched old code.

3. **Assemble startup-optimized chart of accounts.** Use structure below. Codes
   are strings; keep numeric ordering within each type so reports
   sort naturally.

   **Assets (10000-19999)**
   - Cash  -  one sub-line per bank account from
     `domains.banks.accounts[]`, named `Cash  -  {bank} {last4}`. Account
     code format: `1{nnnn}`. Add `Cash  -  Stripe` line if Stripe
     connected as payment processor.
   - Accounts receivable.
   - Prepaid Rent, Prepaid SaaS, Prepaid Insurance (separate lines  -
     amortize on different schedules).
   - Fixed Assets (plus paired Accumulated Depreciation  -  negative
     asset, shown as contra line).

   **Liabilities (20000-29999)**
   - Accounts payable.
   - Accrued Payroll, Accrued PTO (separate from payroll  -  PTO hits
     expense line over time, not at cutover).
   - Accrued Expenses (generic).
   - Deferred Revenue  -  short-term (<12mo) + long-term (>12mo) as
     separate lines for balance sheet split.
   - SAFE Notes, Convertible Notes (separate lines  -  different
     accounting posture on conversion).
   - Income Tax Payable.

   **Equity (30000-39999)**
   - C-corp: Common Stock, Preferred Stock, APIC, APIC-SBC (if
     stock-comp posture ≠ none), Retained Earnings.
   - LLC: Member Capital, Member Draws, Retained Earnings.
   - S-corp: Common Stock, APIC, Distributions, Retained Earnings.

   **Revenue (40000-49999)**
   - Recurring Revenue (subscription monthly revenue / annual revenue).
   - One-Time Revenue.
   - Usage Revenue (only if `revenue.model ∈ {usage, mix}`).
   - Services Revenue (only if `revenue.model ∈ {services, mix}`).
   - Contra-revenue: Refunds & Credits (negative).

   **Cost of goods sold (50000-59999)**
   - Hosting / Infrastructure (AWS, GCP, Vercel).
   - Third-Party API Fees (usage-billed APIs part of cost of goods sold, not R&D
     tools).
   - Payment Processing (Stripe, card fees).
   - Customer Support (if team size ≥ 10 and support function
     exists).

   **Operating expenses (60000-79999)**  -  opinionated breakout makes chart of accounts
   startup-useful. Statement section prefixes keep P&L grouped:

   - **R&D** (60000-64999)  -  R&D Wages, R&D Contractors, R&D
     Software, R&D Cloud (dev/staging, separate from cost of goods sold hosting),
     R&D Other. `statementSection: "operating-expenses.rd"`.
   - **Sales & Marketing** (65000-69999)  -  Sales & Marketing Wages, Advertising, Events &
     Sponsorships, Sales & Marketing Tools (HubSpot, Apollo, etc.), Sales & Marketing Other.
     `statementSection: "operating-expenses.sm"`.
   - **General & Admin** (70000-79999)  -  General & Admin Wages, Legal, Accounting, Rent,
     Insurance, General & Admin SaaS (Slack, Notion, 1Password, etc.), Office
     Supplies, Travel & Meals, General & Admin Other.
     `statementSection: "operating-expenses.ga"`.

   **Other (80000-89999)**  -  below-the-line.
   - Interest Income, Interest Expense.
   - FX Gain / Loss.
   - Gain / Loss on Disposal of Fixed Assets.

   **Suspense (99999)**  -  `statementSection:
   "operating-expenses.ga"` so visible on P&L. Matches ledger's
   `universal.suspenseCode`.

4. **Schema.** Every row:

   ```ts
   {
     code: string;             // ALWAYS a string, never a number
     name: string;
     type: "asset" | "liability" | "equity" | "revenue" | "cogs" | "expense";
     parent?: string;          // code of the parent row for grouped display
     statementSection: string; // e.g. "operating-expenses.rd", "assets.current"
     description?: string;     // one-line disambiguation for categorizers
   }
   ```

5. **Validate before writing.**
   - Every `code` is string and unique across whole chart of accounts.
   - Codes sort numerically within each `type` (no 60500 between
     65000 and 65500  -  keep ranges clean).
   - Every `type` has at least one row (no empty sections).
   - Every `parent` (if set) resolves to row in chart of accounts.
   - Every `statementSection` one of allowed sections:
     `assets.current`, `assets.noncurrent`, `liabilities.current`,
     `liabilities.noncurrent`, `equity`, `revenue`,
     `contra-revenue`, `cogs`, `operating-expenses.rd`,
     `operating-expenses.sm`, `operating-expenses.ga`, `other`.

6. **Write atomically.** Write `config/chart-of-accounts.json.tmp`,
   then rename. Update
   `config/context-ledger.json → universal.coa` with
   `{present: true, path: "config/chart-of-accounts.json", framework,
   lastUpdatedAt}` (read-merge-write).

7. **Revision safeguard.** If revision:
   - Compare against prior chart of accounts. For any **removed** code, check
     `config/prior-categorizations.json` and warn if any vendor
     still maps to that code  -  user must remap vendors or keep
     code.
   - For any **renamed** code (same code, different name), update
     `name` in place  -  categorizations keyed on `code` safe.
   - For any **newly added** code, log in user-facing summary so
     founder knows it exists for next run.

8. **DO NOT append to `outputs.json`.** Chart of accounts is config, not
   deliverable.

9. **Summarize to user.** Counts per type, any adds / renames /
   warnings, next move ("drop statements into
   `statements/_inbox/` and I'll categorize against this chart of accounts").

## Outputs

- `config/chart-of-accounts.json`  -  authoritative chart of accounts, schema per
  Step 4.
- `config/context-ledger.json`  -  `universal.coa` refreshed
  (read-merge-write).

No entry in `outputs.json`.