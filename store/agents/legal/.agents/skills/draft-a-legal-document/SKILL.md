---
name: draft-a-legal-document
description: "Draft a legal document for you, like an NDA, a customer contract, an offer letter, a privacy policy, terms of service, a board decision, a reply to a customer data request, or a brief to send a real lawyer. I work from your existing templates if I have them, or from market-standard wording with a clear note. Drafts only, never sent or signed."
version: 1
category: Drafting
featured: yes
image: scroll
integrations: [googledocs, googledrive, notion, firecrawl]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Draft a Legal Document

One skill for every first-draft founder need. `type` param picks template + structure + citations. "Drafts only, never send / file / sign" discipline shared.

## Parameter: `type`

**Commercial paper (reads template library first):**

- `nda`  -  bilateral or one-way NDA anchored on your template.
- `consulting`  -  consulting / contractor agreement anchored on CIIAA + deliverables + term.
- `offer-letter`  -  employee offer letter anchored on 409A + compensation + vesting + at-will language.
- `msa`  -  customer-facing master services agreement.
- `order-form`  -  order form tied to existing MSA.
- `board-consent`  -  written board consent (routine: officer appointment, option grant, 409A adoption, bank resolutions).

**Privacy / policy:**

- `privacy-policy`  -  full Privacy Policy with AI-training disclosure, SCCs, subprocessor list, legal-basis citations.
- `tos`  -  Terms of Service (usage, IP, acceptable use, liability cap, dispute forum).

**Regulatory response:**

- `dsr-response`  -  GDPR Art. 15 / CCPA DSR first-touch packet: acknowledgment + identity-verification request + export cover note (3 files).

**Escalation:**

- `escalation-brief`  -  structured brief for outside counsel: 2-3 sentence matter summary, specific questions for lawyer, quoted excerpts with cite, deadline, recommended firm type (corporate / commercial lit / privacy / IP / employment). Never names specific firms.

User names type in plain English ("draft NDA with Acme", "write our privacy policy", "package this for counsel") → infer. Ambiguous → ask ONE question naming 10 options grouped by bucket.

## When to use

- Explicit: "draft {type}", "write our privacy policy", "respond to this DSR", "escalate this to counsel".
- Plain-English asks map to a `type`: "draft an NDA for {counterparty}" → `nda`; "draft a contractor / consulting agreement" → `consulting`; "draft a customer contract" / "MSA for {customer}" / "order form" → `msa` or `order-form`; "draft a board consent" / "board decision for {action}" → `board-consent`; "draft / update our privacy policy" → `privacy-policy`; "draft our terms of service" → `tos`; "a customer asked for their data" / "respond to a DSR / GDPR / CCPA request" → `dsr-response`; "package this for a lawyer" / "prep a handoff to outside counsel" / "trademark handoff to a lawyer" → `escalation-brief`.
- Implicit: chained from `review-a-contract` when output recommends counter-draft (type picked by contract type); from `audit-compliance` (scope=privacy-posture) when audit says policy stale; from `plan-contract-pushback` when redline needs specific clause text drafted.

## Ledger fields I read

Reads `config/context-ledger.json` first.

- `universal.legalContext` + `context/legal-context.md`  -  required every type (entity, cap table, standing agreements, template stack, open risks, risk posture). Missing → run `set-up-my-legal-info` skill first (or ask ONE targeted question if skip ahead).
- `universal.company`  -  name, stage (language calibration all types).
- `universal.entity`  -  required for `offer-letter` (state of incorporation, issued shares), `board-consent` (authorized shares, directors, officers), `escalation-brief` (entity snapshot).
- `domains.contracts.templateLibrary`  -  pointing to template set → anchor draft there. Missing for commercial types → ask ONE question: paste template URL, connect Google Drive, or proceed from market-standard boilerplate with "no template found, using market-standard boilerplate" caveat stamped on draft.
- `domains.compliance.landingPageUrl`  -  required for `privacy-policy` and `tos` (Firecrawl scrape infer product surface, data collection, analytics).
- `domains.compliance.dataGeography`  -  required for `privacy-policy` and `dsr-response` (EU inclusion triggers SCCs + GDPR-Art-15 timing).
- `subprocessor-inventory.json`  -  required for `privacy-policy` (vendor list + DPA status).
- `universal.posture.escalationThreshold`  -  required for `escalation-brief` (frames "why we need counsel" framing).

## Steps
<!-- houston-workflow:v1 -->

1. **Read ledger + legal context.** Gather missing required fields per above. Write atomically.
2. **Discover tools via Composio** only when type needs one: `googledocs` / `notion` for mirror-copy (optional), `googledrive` for reading template library, `firecrawl` for landing-page scrape (privacy-policy, tos).
3. **Branch on `type`.**
   - `nda` / `consulting` / `offer-letter` / `msa` / `order-form` / `board-consent`: load matching template from library (or use market-standard boilerplate with caveat stamp). Collect variables (counterparty, dates, commercials, candidate name, grant size, vesting cliff  -  whichever apply). Substitute variables. Produce draft with top comment-block listing (a) variables substituted, (b) any variables needing founder confirmation. Comp structure (offer-letter) or share math (board-consent) non-standard → flag `attorneyReviewRequired: true`.
   - `privacy-policy` / `tos`: scrape landing page via Firecrawl, cross-reference `subprocessor-inventory.json`, identify data-collection surfaces (forms, analytics, cookies, payment), pick right sections (Collection / Use / Disclosure / Retention / Rights / Transfers / Security / Changes / Contact for privacy; Usage / Account / IP / Acceptable-Use / Payment / Termination / Warranty / Liability / Disputes for ToS). Cite GDPR articles for EU-inclusive geography, CCPA/CPRA for US. AI-training disclosure explicit (opt-in or opt-out, state it). Produce sectioned markdown draft.
   - `dsr-response`: compute statutory clock (GDPR Art. 15 → 30 days, CCPA → 45 days). Produce three files: `acknowledgment.md` (received, clock start, expected turnaround  -  no commitments beyond statutory timeline), `identity-verification.md` (what we need to confirm it's them), `export-cover-note.md` (template cover note; actual data export out of scope  -  founder runs export). Clock already < 7 days from statutory deadline → flag `attorneyReviewRequired: true`. Write as folder `dsr-responses/{request-id}-{YYYY-MM-DD}/`.
   - `escalation-brief`: structured brief in this order  -  (1) Matter in 2-3 sentences, (2) Specific questions for lawyer (numbered, scoped), (3) Deadline + why, (4) Quoted excerpts with cite (contract clause, email thread, statute), (5) Entity snapshot from `universal.entity`, (6) Recommended firm type (corporate / commercial lit / privacy / IP / employment  -  no firm names), (7) What we'd accept as outcome.
4. **Write draft atomically** (`*.tmp` → rename):
   - Commercial types → `drafts/{type}/{counterparty-or-candidate}-{YYYY-MM-DD}.md`.
   - `privacy-policy` → `privacy-drafts/privacy-policy-{YYYY-MM-DD}.md`.
   - `tos` → `privacy-drafts/tos-{YYYY-MM-DD}.md`.
   - `dsr-response` → `dsr-responses/{request-id}-{YYYY-MM-DD}/` (folder with three files).
   - `escalation-brief` → `escalations/{matter-slug}-{YYYY-MM-DD}.md`.
5. **Optional Google Docs mirror.** `googledocs` connected → offer mirror draft (skill discovers slug at runtime, user confirms, mirror created with link back in artifact footer).
6. **Append to `outputs.json`**  -  read-merge-write atomically: `{ id, type: "draft" | "privacy-policy" | "tos-draft" | "dsr-response" | "escalation-brief", title, summary, path, status: "draft", domain: "contracts" (commercial) | "compliance" (privacy/dsr) | "entity" (board-consent) | "advisory" (escalation-brief), createdAt, updatedAt, attorneyReviewRequired? }`.
7. **Summarize to user.** One short message in plain language: what you drafted, that it's a draft for review (not signed/sent), and whether a real lawyer should look at it. Never mention file names, paths, or the underlying procedure.

## What I never do

- Send, file, post, or request signature on any draft. Founder delivers, publishes, or packages-for-counsel. Every artifact opens with one-line "DRAFT  -  NOT FOR SIGNATURE / NOT FOR PUBLISH" stamp.
- Invent clause, statute, or precedent I can't cite.
- Name specific law firms in `escalation-brief`. Firm type only.
- Make timeline commitments in `dsr-response` beyond statutory clock  -  dates cited are statutory, not promises.
- Hardcode tool names  -  Composio discovery at runtime only.
- Skip `attorneyReviewRequired: true` on comp-structure anomalies, share-math anomalies, or DPA gaps.

## Outputs

- `drafts/{type}/{slug}-{YYYY-MM-DD}.md` (commercial types).
- `privacy-drafts/privacy-policy-{YYYY-MM-DD}.md` / `tos-{YYYY-MM-DD}.md`.
- `dsr-responses/{request-id}-{YYYY-MM-DD}/` (3-file folder).
- `escalations/{matter-slug}-{YYYY-MM-DD}.md`.
- Appends to `outputs.json`.