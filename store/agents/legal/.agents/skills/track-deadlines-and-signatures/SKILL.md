---
name: track-deadlines-and-signatures
description: "Keep tabs on what's outstanding on the legal side. Pick what you need: chase pending signatures, log a freshly signed agreement, see what deadlines are coming up, or get a Monday rollup of the week. I keep a running list so nothing slips."
version: 1
category: Tracking
featured: no
image: scroll
integrations: [googledrive, gmail, notion]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Track Deadlines and Signatures

One skill for every standing-state tracker agent maintain. `scope` param pick tracker; atomic read-merge-write discipline shared.

## Parameter: `scope`

- `signatures`  -  watch connected signing platform (DocuSign / PandaDoc / HelloSign) for outstanding docs. Draft polite reminders for laggards (never send). File executed copies to connected doc-storage (Google Drive / Dropbox / Notion). Write status board to `signature-status/{YYYY-MM-DD}.md`.
- `counterparties`  -  append executed agreement to `counterparty-tracker.json` at agent root. Fields: `id`, `counterparty`, `agreementType`, `executedDate`, `effectiveDate`, `term`, `autoRenewal`, `noticePeriod`, `governingLaw`, `keyObligations`, `renewalDate`, `signedCopyPath`. Feed `deadlines` scope (renewal clock) + `weekly-review` scope (rollup).
- `deadlines`  -  seed + refresh canonical legal calendar. Static deadlines (Delaware March 1 annual report, 83(b) 30-day from grant, 409A refresh 12 months, DSR 30-day GDPR / 45-day CCPA, TM office action 6-month, annual board consent) + dynamic deadlines from `counterparty-tracker.json` (renewal clocks, notice windows). Write `deadline-calendar.json` at agent root + 90-day readout to `deadline-summaries/{YYYY-MM-DD}.md`. Flag ≤ 30 days urgent, overdue critical.
- `weekly-review`  -  aggregate across agent by reading `outputs.json`: what shipped this week (contract reviews, drafts, audits, filings), what pending signature (from `signature-status/` most recent), next deadline (from `deadline-calendar.json`), what flagged for attorney review (`attorneyReviewRequired: true` entries without resolution). Write `weekly-reviews/{YYYY-MM-DD}.md`.

If user name scope plain English ("chase signatures", "log this deal", "what's due", "Monday review"), infer. If ambiguous, ask ONE question naming 4 options.

## When to use

- Explicit: "where are my signatures", "log {counterparty}'s executed {type}", "what's due soon / overdue", "Monday legal review", "weekly legal readout".
- Plain-English asks map to a `scope`: "nudge / chase pending signatures" / "who hasn't signed yet" → `signatures`; "I just signed something, log it" / "log this signed agreement" / "track this auto-renewal" → `counterparties`; "check my legal deadlines" / "what's coming up in the next 90 days" → `deadlines`; "weekly legal review" / "Monday rollup" → `weekly-review`.
- Implicit: chained from `review-a-contract` (any mode) to `counterparties` when contract hit executed status; from scheduled routines for `weekly-review` + `deadlines`; from `sort-my-legal-inbox` when detect executed-copy attachment for `counterparties`.

## Ledger fields I read

Read `config/context-ledger.json` first.

- `universal.legalContext` + `context/legal-context.md`  -  recommended not required. Enrich `weekly-review` with standing context. If missing + `weekly-review` scope, run `set-up-my-legal-info` skill or proceed with note.
- `universal.entity`  -  required for `deadlines` (formation date gate Delaware March 1 relevance; 409A date set 12-month clock).
- `domains.contracts.signingPlatform`  -  required for `signatures`. If missing, ask ONE question  -  connect DocuSign / PandaDoc / HelloSign or paste status.
- `domains.contracts.documentStorage`  -  required for `signatures` (where to file executed copies) + `counterparties` (where signed copy live  -  `signedCopyPath`).
- `counterparty-tracker.json`  -  required for `counterparties` (read-merge-write) + `deadlines` (source of dynamic renewal clocks) + `weekly-review` (new logs this week).
- `deadline-calendar.json`  -  required for `deadlines` (baseline to diff against) + `weekly-review` (next-deadline surface).
- `outputs.json`  -  required for `weekly-review` (roll-up source).

If any required field missing, ask ONE targeted question with right modality hint, write, continue.

## Steps
<!-- houston-workflow:v1 -->

1. **Read ledger + state files.** Gather missing required fields per above. Write atomically.
2. **Discover tools via Composio.** `composio search signing-platform` (signatures), `composio search document-storage` (signatures + counterparties). No discovery needed for `deadlines` or `weekly-review` (pure file ops).
3. **Branch on `scope`.**
   - `signatures`:
     1. Execute signing-platform slug  -  list outstanding envelopes. For each: recipient, sent date, days open, last-viewed status.
     2. Draft polite reminder per laggard (> 5 days open). Never send  -  drafts go into status board for founder to send.
     3. For executed envelopes, fetch PDF via signing-platform slug. Execute doc-storage slug to save to well-known path (`contracts/executed/{counterparty}-{YYYY-MM-DD}.pdf`).
     4. Write `signature-status/{YYYY-MM-DD}.md`  -  three sections: Outstanding (+ reminders) / Recently executed (+ paths) / Stalled (> 14 days open  -  recommend outreach or withdraw). For each executed envelope, recommend chain to `track-deadlines-and-signatures` scope=counterparties to log.
   - `counterparties`:
     1. Take input: counterparty name, agreement type, executed date, effective date, term, auto-renewal, notice period, governing law, key obligations (brief), signed-copy path. Ask ONE question for any missing field.
     2. Compute `renewalDate` from `effectiveDate + term - noticePeriod` (critical date = when notice must be given to avoid auto-renewal).
     3. Read-merge-write `counterparty-tracker.json` atomically. Do not overwrite existing rows  -  `id` stable; update-in-place on match.
     4. Append to `outputs.json` as `type: "counterparty-log"`.
   - `deadlines`:
     1. Start from canonical static deadline set:
        - **Delaware annual report**  -  March 1 every year (gate on `universal.entity.state === "DE"`).
        - **83(b) election window**  -  30 days from each option grant / founder-stock restricted-purchase. Source: `outputs.json` entries for recent grants.
        - **409A refresh**  -  12 months from `universal.entity.four09aDate`.
        - **DSR response window**  -  30 days (GDPR Art. 15) / 45 days (CCPA); track from any `dsr-response` entry in `outputs.json`.
        - **TM office action response**  -  6 months from each office action; gate on `domains.ip.marks`.
        - **Annual board consent**  -  365 days from last board consent.
     2. Enrich with dynamic deadlines from `counterparty-tracker.json`  -  for each open row, compute `renewalDate` + notice-deadline (= `renewalDate - noticePeriod`).
     3. Read-merge-write `deadline-calendar.json`: `id`, `kind`, `label`, `due`, `source`, `authority`, `urgency` (critical if overdue or ≤ 30 days; high ≤ 90 days; medium ≤ 180 days; low > 180 days).
     4. Write `deadline-summaries/{YYYY-MM-DD}.md`  -  90-day readout: Critical + High first; for each, cite authority (e.g. "8 Del. C. §503", "IRC §83(b)", "GDPR Art. 15").
     5. Append to `outputs.json` as `type: "deadline-summary"`.
   - `weekly-review`:
     1. Read `outputs.json`. Filter to entries with `createdAt` or `updatedAt` within last 7 days.
     2. Group by `domain` (contracts / compliance / entity / ip / advisory). For each: what shipped, titles + paths.
     3. Read most recent `signature-status/`  -  surface outstanding signatures + stalled.
     4. Read `deadline-calendar.json`  -  next 3 deadlines by urgency.
     5. Surface any `attorneyReviewRequired: true` entries that don't yet have `escalation-brief` follow-up.
     6. Write `weekly-reviews/{YYYY-MM-DD}.md`  -  sections: What shipped (by domain) / Pending signature / Next 3 deadlines / Attorney-review backlog / Recommended next moves.
     7. Append to `outputs.json` as `type: "weekly-review"`.
4. **Atomic writes everywhere** (`*.tmp` → rename).
5. **Summarize to user.** One short paragraph in plain language: the most important thing from this run (the deadline they need to know about, the signatures still pending, what shipped this week). Never name files or paths.

## What I never do

- Send reminders, request signatures, or file executed copies anywhere outside configured doc-storage. Every "sendable" artifact is draft in status board.
- Invent counterparty, term, or deadline. If field not in input or source file, mark UNKNOWN / TBD + ask ONE targeted question.
- Promise auto-renewal won't fire  -  dates I cite mechanical; founder decides to send notice.
- Overwrite `counterparty-tracker.json` or `deadline-calendar.json`  -  read-merge-write always.
- Cite statutory deadline without naming authority (GDPR Art. 15, IRC §83(b), 8 Del. C. §503, etc.).
- Hardcode tool names  -  Composio discovery at runtime only.

## Outputs

- `signature-status/{YYYY-MM-DD}.md` (scope=signatures).
- Updates `counterparty-tracker.json` (scope=counterparties).
- `deadline-summaries/{YYYY-MM-DD}.md` + updates `deadline-calendar.json` (scope=deadlines).
- `weekly-reviews/{YYYY-MM-DD}.md` (scope=weekly-review).
- Appends to `outputs.json`.