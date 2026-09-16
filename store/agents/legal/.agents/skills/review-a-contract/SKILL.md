---
name: review-a-contract
description: "Read a contract someone sent you and tell you what's in it. Pick how deep: a quick verdict on whether it's safe to sign, a fast NDA check, or a clause-by-clause map without a verdict. Every clause that needs attention gets a clear note and, when needed, suggested wording to push back with."
version: 1
category: Contracts
featured: yes
image: scroll
integrations: [googledocs, googledrive, notion, firecrawl]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Review a Contract

One skill for first-read of counterparty contract. `mode` pick depth. Structured clause extraction + "never invent clause-standard can't cite" discipline shared.

## Parameter: `mode`

- `full`  -  full MSA / DPA / order-form review: clause map + Green (accept) / Yellow (pushback OK) / Red (redline required) verdict per clause + plain-English summary + accept / redline / walk rec. Writes to `contract-reviews/{counterparty}-{YYYY-MM-DD}.md`.
- `nda-traffic-light`  -  fast 6-dimension rubric for inbound NDAs (term, mutuality, confidential-info definition, carve-outs, jurisdiction, non-solicit smuggling, return/destruction). Writes to `ndas/{counterparty-slug}-{YYYY-MM-DD}.md` with specific redlines on every Red item.
- `clauses-only`  -  structured extraction, no verdict. Reads supplied contract (file / URL / paste), extracts clauses that matter (term, termination, renewal, liability cap, indemnity, IP, governing law, DPA, AI training, data residency, exit rights), writes human-readable map to `clause-extracts/{counterparty}-{YYYY-MM-DD}.md`, updates `counterparty-tracker.json` with key fields.

User name mode in plain English ("traffic-light this", "just extract the clauses", "full review with a verdict") → infer. Ambiguous → ask ONE question naming 3 options.

## When to use

- Explicit: "review this contract", "traffic-light this NDA", "is this signable?", "what's in this agreement", "extract clauses".
- Plain-English asks map to a `mode`: "fully review this customer contract / MSA" / "is this MSA safe to sign" → `full`; "quick check on this NDA" / "is this NDA OK to sign" → `nda-traffic-light`; "just lay out the clauses" / "pull out the clauses, no verdict" / "review the IP clause" (run `full` and lead with the IP section) → `clauses-only` or `full` with IP focus.
- Implicit: called by `sort-my-legal-inbox` when detects MSA / NDA / DPA and routes to review. Chained into `plan-contract-pushback` when output has any Red items.

## Ledger fields I read

Reads `config/context-ledger.json` first.

- `universal.legalContext` + `context/legal-context.md`  -  required. Provides entity (governing-law compat check), standing agreements (template-vs-market compare), open risks, founder risk posture. If `context/legal-context.md` missing, run `set-up-my-legal-info` skill first (or ask ONE targeted question to skip ahead).
- `universal.posture.risk`  -  drives Yellow-vs-Red threshold. `lean` posture accepts more Yellow, `conservative` flips marginal Yellow to Red.
- `domains.contracts.counterpartyStack`  -  if counterparty in standing stack, reference prior executed terms.
- `domains.contracts.documentStorage`  -  so I know where to read contract from (Google Drive, Dropbox, Notion).

Required field missing → ask ONE targeted question with modality hint (connect Google Drive / paste contract text / URL to public PDF), write it, continue.

## Steps
<!-- houston-workflow:v1 -->

1. **Read ledger + legal context.** Gather missing required fields per above. Write atomically.
2. **Acquire contract.** Priority: connected document-storage (Google Drive) > URL + Firecrawl scrape > file drop > paste. Only PDF supplied + no text-extraction tool connected → say so, ask for text-extractable version.
3. **Discover tools via Composio.** Run `composio search document-storage` / `composio search web-scrape` as needed. No connection + contract is URL → ask user to paste text.
4. **Branch on `mode`.**
   - `full`: extract clause map (see `clauses-only` below), grade each clause vs market standard for solo-founder stage company:
     - **Green**  -  accept as-written.
     - **Yellow**  -  pushback OK but not required.
     - **Red**  -  redline required before signing.
     Produce: executive summary (2-3 sentences), clause-by-clause table (Clause | Counterparty text | Verdict | Why | Suggested redline if Red), overall rec (Accept / Redline / Walk). Any clause outside confident range (unusual IP carve-out, complex indemnity stack, non-standard data-protection addendum) → flag `attorneyReviewRequired: true` and rec chaining to `draft-a-legal-document` type=escalation-brief.
   - `nda-traffic-light`: run 7-dimension rubric:
     1. **Term** (indefinite = Red, > 5 years = Yellow).
     2. **Mutuality** (one-way from bigger party = Yellow, one-way from us = Green if we discloser, Red if not).
     3. **Confidential information definition** (too broad = Red, exclusion of publicly known info missing = Red).
     4. **Carve-outs** (residual-knowledge clause = Red, standard legal-process + independent-development = Green).
     5. **Jurisdiction** (counterparty's non-US state = Yellow, non-US country = Red, Delaware / California / NY = Green).
     6. **Non-solicit smuggling** (employee non-solicit hidden in NDA = Red; call out explicitly).
     7. **Return/destruction** (missing = Yellow, 30-day certification requirement = Yellow, 5-day = Red).
     Write specific redline for every Red item (not generic "we'll send you our form"). Produce one-paragraph summary + verdict + redlines.
   - `clauses-only`: no verdict. Extract clause-by-clause:
     - Parties, effective date, term, auto-renewal, notice period.
     - Payment terms, fee schedule, tax handling.
     - Termination (for convenience, for cause, notice period).
     - Liability cap (per-claim / annual / unlimited / supercap).
     - Indemnity (mutual / one-way, carve-outs, process).
     - IP (work product, assignment, background IP, feedback).
     - DPA / data handling (transfer mechanism, subprocessors, SCCs).
     - AI training / data use (explicit opt-out, training rights).
     - Data residency, governing law, dispute forum, arbitration.
     - Exit rights (data return / destruction, transition window).
     - Assignment, change-of-control, flow-downs.
     Each clause: counterparty-text (quoted) + plain-English paraphrase + "what to watch" one-liner (no verdict).
5. **Update `counterparty-tracker.json`** (every mode)  -  read-merge-write atomically. Append or update row for counterparty with extracted structural fields (type, term, auto-renewal, notice period, governing law, renewal date if computable).
6. **Write artifact atomically** (`*.tmp` → rename):
   - `full` → `contract-reviews/{counterparty-slug}-{YYYY-MM-DD}.md`.
   - `nda-traffic-light` → `ndas/{counterparty-slug}-{YYYY-MM-DD}.md`.
   - `clauses-only` → `clause-extracts/{counterparty-slug}-{YYYY-MM-DD}.md`.
7. **Append to `outputs.json`**  -  read-merge-write atomically: `{ id (uuid v4), type: "contract-review" | "nda-review" | "clause-extract", title, summary, path, status: "ready", domain: "contracts", createdAt, updatedAt, attorneyReviewRequired? }`.
8. **Summarize to user.** One short paragraph in plain language: the overall verdict (or "no verdict" if extraction-only) and what jumps out. If anything's a deal-breaker, offer the next step plainly: "Want me to plan the pushback?" Never name files, paths, or internal procedures.

## What I never do

- Invent clause standard can't cite. "Market standard" for term unclear → mark UNKNOWN, rec attorney review.
- Render final legal advice. Every `full` review includes "this is first pass, attorney review recommended for non-routine clauses" disclaimer.
- Signal verdict on clause haven't actually extracted. DPA referenced but not attached → mark DPA section UNKNOWN.
- Hardcode tool names  -  Composio discovery at runtime only.
- Overwrite `counterparty-tracker.json`  -  read-merge-write.

## Outputs

- `contract-reviews/{counterparty}-{YYYY-MM-DD}.md` (mode=full).
- `ndas/{counterparty-slug}-{YYYY-MM-DD}.md` (mode=nda-traffic-light).
- `clause-extracts/{counterparty}-{YYYY-MM-DD}.md` (mode=clauses-only).
- Updates `counterparty-tracker.json` (every mode).
- Appends to `outputs.json`.