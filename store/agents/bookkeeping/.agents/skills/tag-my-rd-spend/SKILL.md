---
name: tag-my-rd-spend
description: "Tag your qualified R&D spend for Section 174 / federal R&D credit support. I bucket spend into the four IRS categories — qualified wages by employee role and time share, supplies, cloud / computer leasing, contract research at 65% — allocate it across your projects (or one 'Unallocated R&D' bucket if no project list), and call out the typical exclusions (post-release fixes, routine analytics, funded research). Support package only — your tax preparer files Form 6765 and any state equivalents."
version: 1
category: Bookkeeping
featured: no
image: ledger
x_houston:
  created_by: houston
  skill_schema: 1
---


# Tag My R&D Spend

Section 174 and R&D-credit support for the tax year. I bucket qualified spend into the four IRS categories — wages, supplies, cloud / computer leasing, contract research at 65% — and allocate by project where you have one. Exclusions (routine analytics, post-release work, funded research, General & Admin of R&D) are listed with citations so your tax preparer can audit each call. Support only — I never file Form 6765.

## When to use

- "tag R&D spend for the credit" / "Section 174 breakout" / "classify R&D expenses for {year}".
- Called by `hand-off-to-my-tax-preparer` when `domains.tax.rdCreditEligible == "yes"`.
- Before year-end handoff, surface missing project tags or uncertain R&D-vs-General & Admin calls.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Payroll provider** (Gusto, Rippling, Justworks, Deel, ADP) — preferred source for wages by employee and role, which drives the qualified-wages bucket. Required if you have employees.
- **QuickBooks Online or Xero** (accounting) — optional supplement for vendor payments and contractor spend if I can't see them in run history.

If no payroll connection exists and you do have employees I stop and ask you to connect your payroll tool, or drop a payroll summary CSV.

## Information I need

I read your bookkeeping context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **The tax year you're claiming** — Required. Why: defines the date range I aggregate spend across. If missing I ask: "Which tax year are we classifying R&D for?"
- **R&D-credit eligibility** — Required. Why: confirms whether to run a federal-credit-style breakout or just a Section 174 amortization view. If missing I ask: "Is the company planning to claim the federal R&D credit this year, or is this just for Section 174 amortization?"
- **Each employee's role and the share of their time spent on qualified R&D** — Required. Why: drives the qualified-wages bucket; engineers default to 100%, product / design less. If missing I ask: "What does each person on the team do, and roughly what share of their time is hands-on engineering or research? If you'd rather, I'll start with defaults (engineering 100%, product 50%, design 25%, others 0%) and you correct anything off."
- **Your project list** — Optional. Why: lets me allocate qualified spend by project, which the credit form wants. If you don't have it I roll everything into one "Unallocated R&D" bucket.
- **Your cloud-hosting R&D share** — Optional. Why: pre-revenue companies usually treat 100% of cloud as R&D; revenue companies split production vs. R&D. If missing I ask: "How much of your AWS / GCP / Vercel spend is for development and research vs. running the live product? If you don't have it I default to 100% R&D pre-revenue."

## Steps
<!-- houston-workflow:v1 -->

1. **Read context.** Load `context/bookkeeping-context.md`, `config/context-ledger.json`, `config/chart-of-accounts.json`. Required ledger: `universal.company`, `domains.payroll`, `domains.tax.rdCreditEligible`. If `rdCreditEligible == "no"`, warn but proceed if user confirms (state credits / Section 174 amortization still use this breakout).

2. **Determine tax year.** Use user's year if specified; else current running draft year.

3. **Role → R&D% map (one-time, cached).** If `domains.payroll.rdWagePctByRole` missing, ask once: defaults engineering 100%, product 50%, design 25%, non-technical 0%; user overrides. Write atomically.

4. **Project list (one-time, cached).** If `config/rd-projects.json` absent, ask user for one line per project (name + description). Write `[{slug, name, description}]` atomically. If declined, use one bucket: "Unallocated R&D".

5. **Pull qualified transactions.** Read every `runs/*/run.json` whose period overlaps tax year; also `journal-entries.json` for journal entries posted in year (payroll accruals, cloud accruals).

6. **Bucket 1  -  Wages for qualified services.** From payroll journal entries (or direct from Gusto / Rippling / Justworks via Composio): per employee, get role + gross wages, multiply by role R&D%, sum. Cite each row by journal entry id + employee name. Exclude founders' non-technical time, General & Admin roles, all stock comp (wages only).

7. **Bucket 2  -  Supplies.** Transactions under chart of accounts `"supplies"` / `"rd-supplies"`. Typical for hardware / biotech; usually $0 for pure SaaS. Materials **consumed** in research only  -  capital equipment goes through depreciation.

8. **Bucket 3  -  Computer leasing / cloud.** Walk transactions for canonical parties like `{AWS, Amazon Web Services, GCP, Azure, Digital Ocean, Linode, Vercel, Fly.io, Render, Netlify, Heroku, Cloudflare}` plus others from `prior-categorizations.json` under cloud/hosting account codes. Ask user for R&D portion (default 100% pre-revenue; revenue-producing companies split production vs. R&D). Cache to `domains.tax.cloudRdPct`.

9. **Bucket 4  -  Contract research at 65%.** Transactions under `"contractor"` / `"professional-services"` / `"consulting"` where vendor does qualified R&D (engineering contractors, research consultants, prototype fab). Code caps inclusion at 65%  -  `qualified = 0.65 * payment`. Cite every transaction.

10. **Allocate across projects.** Assign each qualified row to project:
    - Payroll: ask per-person splits (default: even across active projects). Cache per person.
    - Cloud: default even split unless user provides per-project cost tags.
    - Contractors: infer from transaction description / invoice memo; fall back to user confirm.
    - Supplies: infer from PO / memo if available.
    Unallocated rows roll into "Unallocated R&D".

11. **Exclusions.** Call out spend that looks like R&D but not qualified per Treas. Reg. §1.41:
    - Routine data collection (customer analytics, BI dashboards for operations).
    - Post-commercial-release improvements (minor bug fixes, cosmetic UI on shipped features).
    - Funded research (another party owns results AND bears risk).
    - Duplication of existing business component.
    - Management / General & Admin of R&D (project-management time not doing qualified research).
    - Marketing, market research, advertising.
    Surface each with citations + rule invoked. Exclude from qualified total. User overrides.

12. **Write `compliance/rd-credit/{year}.md`.** Atomic write. Structure:
    - **Summary**  -  total qualified R&D spend; breakdown by category + project. One headline: qualified-research expense total.
    - **Per-project breakdown**  -  project × category matrix with row + column totals.
    - **Per-category detail**  -  row-level detail per category (employee or vendor, amount, project allocation) with citations.
    - **Exclusions**  -  what pulled out, with citations + rule.
    - **Judgment-call notes**  -  role-% assumptions, cloud R&D%, any uncertain vendor. User decides; I flag options.
    - **Filing note**  -  "Support only. The tax preparer files Form 6765 (federal) and any state equivalents. Section 174 capitalization / 5-year amortization is a separate return computation."

13. **Append to `outputs.json`.** Row: `{type: "rd-classification", title: "R&D credit support {year}", summary, path, status: "draft", domain: "compliance"}`. Read-merge-write.

14. **Summarize to user.** One paragraph: total qualified spend, per-category totals, per-project totals if projects defined, count of judgment calls, reminder that preparer files Form 6765  -  not me.

## Outputs

- `compliance/rd-credit/{year}.md` (indexed as `rd-classification`)
- `config/rd-projects.json` (cached project list, if provided)
- Ledger updates: `domains.payroll.rdWagePctByRole`, `domains.tax.cloudRdPct`, per-employee project splits