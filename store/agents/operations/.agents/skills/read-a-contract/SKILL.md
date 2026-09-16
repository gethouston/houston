---
name: read-a-contract
description: "Get the standard clauses out of a contract or a whole folder of them without reading legalese yourself. I extract liability caps, termination terms, auto-renewal, payment terms, IP, data handling, uptime commitments, and exclusivity, each with the verbatim quote, a plain-language summary, and a flag on anything unfavorable for your vendor posture. The renewal calendar updates automatically."
version: 1
category: Operations
featured: no
image: clipboard
integrations: [googledrive]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Read A Contract

## When to use

- "pull the {clause} from this contract" (single doc).
- "what are the auto-renew terms in every contract in this folder" (batch).
- "extract the liability cap and termination language from {vendor}'s master service agreement".

## Connections I need

I run external work through Composio. Before this skill runs I check the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Files** (Google Drive)  -  Required for batch runs and named-vendor lookups. I scan folders or named contracts here.
- **Document processing** (OCR or PDF text extraction)  -  Required. Pulls the actual text out of scanned or native PDFs so I can extract clauses verbatim.

If no files provider is connected and you haven't pasted the contract, I stop and ask you to connect Google Drive or paste the document.

## Information I need

I read your operations context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **The contract itself**  -  Required. Why I need it: I can't extract from nothing. If missing I ask: "Drop the contract or point me at the folder. PDF, Word, or a Google Doc all work."
- **Vendor posture**  -  Required. Why I need it: tells me which terms count as a flag. A conservative posture flags more aggressively than fast-risk. If missing I ask: "How do you approach vendor terms  -  conservative, balanced, or move fast?"
- **Operating context doc**  -  Required. Why I need it: anchors hard nos so I flag clauses that would violate them. If missing I ask: "Want me to set up your operating context first? Helps me catch unfavorable terms more reliably."

## Steps
<!-- houston-workflow:v1 -->

1. **Read `context/operations-context.md`.** If missing: stop, ask user run `set-up-my-ops-info` skill first. Vendor posture + hard nos anchor "unfavorable terms" flags.

2. **Read `config/procurement.json`**  -  approval posture decide which terms count as "flag worthy" (conservative founder flag more; fast-risk founder flag only truly egregious).

3. **Identify target contract(s).**
   - Single file: user paste text, share URL, or point at file in connected drive.
   - Batch (folder): `composio search drive` → list files in specified folder → filter to contract-flavored (PDF/DOCX/DOC).
   - Named vendor: look in `contracts/` first; if absent, search drive via `composio search drive`.

4. **Parse each contract.** Use `composio search doc-processing` to find best doc-processing tool for format (OCR for scanned PDFs, text extractor for native PDFs, DOCX reader). Execute by slug, pull full text.

5. **Extract standard clauses.** Per contract, locate + extract:
   - **Liability cap**  -  quote + cap amount + carve-outs.
   - **Termination**  -  for-cause terms, for-convenience terms, notice windows.
   - **Auto-renewal**  -  presence, term length, notice-to-not-renew window.
   - **Payment terms**  -  amount, frequency, true-up / overage, late fees.
   - **IP ownership**  -  who own work product, background IP rules.
   - **Data handling / data processing agreement**  -  data processing agreement presence, data residency, breach notification response-time commitment.
   - **Uptime commitment**  -  uptime commitment, remedies.
   - **Exclusivity / non-compete**  -  presence + scope.

   Per clause: **verbatim quote** + **1-line plain-language summary** + **1-line flag** if unusual or unfavorable per vendor posture. If clause absent, mark `ABSENT` explicit  -  never omit.

6. **Write** to `contracts/{vendor-slug}-{YYYY-MM-DD}.md` with full extraction. Batch runs: one file per contract + `contracts/batch-{YYYY-MM-DD}-summary.md` rolling up flags across batch.

7. **Update renewal calendar.** If contract has renewal date, call `track-my-renewals` skill internally (or note `track-my-renewals` should re-run) and add/update entry in `renewals/calendar.md`.

8. **Atomic writes**  -  `*.tmp` → rename.

9. **Append to `outputs.json`** with `type: "contract"`, status "ready" per contract. Batch: single `contract` entry for summary + one per contract processed.

10. **Summarize to user**  -  #1 flag that most warrant founder attention (e.g. "auto-renew is in 11 days and notice window is 30 days  -  already too late to stop this one"). Path to file(s).

## Outputs

- `contracts/{vendor-slug}-{YYYY-MM-DD}.md` (one per contract)
- Optional `contracts/batch-{YYYY-MM-DD}-summary.md` (batch runs)
- Updates to `renewals/calendar.md`
- Appends to `outputs.json` with `type: "contract"`.

## What I never do

- **Sign** or accept any contract.
- **Invent** clause. If contract has no liability cap, mark `ABSENT`.
- **Interpret legally.** Flag for founder attention; founder consult legal.