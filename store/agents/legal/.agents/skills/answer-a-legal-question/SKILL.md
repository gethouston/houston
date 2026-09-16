---
name: answer-a-legal-question
description: "Get a quick answer to a legal question, like 'do I need an NDA with investors?' or 'does GDPR apply to me?'. You get a short memo with the answer, the reasoning, the sources, and what to do next. Sensitive or unusual questions get flagged for a real lawyer."
version: 1
category: Advisory
featured: yes
image: scroll
integrations: [stripe]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Answer a Legal Question

## When to use

- "do I need an NDA with investors?"  -  typically no, pitch-stage investors refuse.
- "do I need a DPA with {vendor}?"  -  depends on data + region.
- "does GDPR apply to me?"  -  depends on EU visitors/customers + data.
- "can I use this customer logo on my landing page?"  -  depends on MSA marketing rights clause.
- "do I need to file an 83(b)?"  -  probably yes, within 30 days of stock issuance. Hard deadline.
- Any "do I need X?" or "does X apply?" fits short memo.

## Steps
<!-- houston-workflow:v1 -->

1. **Read shared context.** Load `legal-context.md` for entity, data geography of current users, standing agreements, founder risk posture, escalation rules. Also read relevant prior `advice-memos/` entries  -  don't re-answer decided stuff.

2. **Clarify question (at most one follow-up).** If question hinges on fact not in context, ask ONE targeted question with best-modality hint. Examples:
   - "Does GDPR apply?" → "Do you have analytics on your landing page, and any EU visitors? If your analytics tool is connected, I can check in 30 seconds."
   - "Do I need DPA with {vendor}?" → "What data {vendor} touch  -  customer PII, payment data, employee data, or own company docs?"
   Don't ask more than one. Broad question → scope it ("narrow to {subquestion}").

3. **Research if needed.** For questions citing regulations, checklists, market standards, use `composio search web-search` (or similar  -  discover at runtime) to pull authoritative sources: primary statute/regulation text, EDPB / IRS / SEC / USPTO guidance, reputable founder-legal checklists (Capbase, Andrew Bosin, Promise Legal, YC, Common Paper). Cite every source inline. No "probably" hedges  -  state or mark UNKNOWN.

4. **Draft memo (~200-400 words, direct, verb-led).** Structure:

   1. **Question**  -  founder's question in one sentence, verbatim if possible.
   2. **Short answer**  -  one paragraph. First sentence = bottom line ("Yes", "No", "It depends  -  here's rule"). No hedging. If depends, state two or three forks + what decides between.
   3. **Context**  -  one paragraph: why applies to this founder. Reference entity (Delaware C-corp), stage (week 0, pre-revenue / one customer), stack (Stripe, Google Workspace), any relevant standing agreement or data geography.
   4. **Sources cited**  -  bulleted. Each with one-line why-it-matters. Primary statute > regulator guidance > reputable checklist. 2-5 sources, no Wikipedia.
   5. **Next move**  -  one concrete action in plain language. Examples: "Draft a DPA with this vendor.", "Add this vendor to your privacy vendor list.", "File 83(b) within {N} days  -  I can track the deadline."
   6. **Judgment-call disclaimer**  -  "This is a judgment call, not final legal advice. Escalate to outside counsel if {specific condition  -  e.g. data is health-related, customer is a regulated entity, deal over $100K}."

5. **Flag `attorneyReviewRequired: true`** if question touches:
   - HIPAA, PCI-DSS, COPPA, biometrics, export controls.
   - International data transfers with non-standard mechanism.
   - Tax treatment decisions (QSBS eligibility, 83(b) filing mechanics beyond deadline itself, R&D credit).
   - Securities offerings beyond standard SAFE / priced round.
   - Employment law beyond at-will / offer-letter / CIIAA trio.
   - Anything criminal, regulatory enforcement, or litigation-adjacent.

6. **Write atomically** to `advice-memos/{slug}-{YYYY-MM-DD}.md`  -  `{path}.tmp` then rename. Slug = short kebab-case of question (e.g. `gdpr-applies-to-landing-page`, `do-i-need-nda-with-investors`, `dpa-with-stripe`).

7. **Append to `outputs.json`.** Read-merge-write atomically:

   ```json
   {
     "id": "<uuid v4>",
     "type": "advice-memo",
     "title": "Advice  -  <question short form>",
     "summary": "<2-3 sentences  -  the bottom line + the next move>",
     "path": "advice-memos/<slug>-<YYYY-MM-DD>.md",
     "status": "ready",
     "attorneyReviewRequired": <true | false>,
     "createdAt": "<ISO-8601>",
     "updatedAt": "<ISO-8601>"
   }
   ```

   (Advice memos ship as `ready`  -  factual + cited; founder decides whether to act, not whether to approve draft.)

8. **Summarize to user.** One short paragraph in plain language: bottom line, next move, and whether a real lawyer should look at it. Never mention file names, paths, or the underlying memo location  -  just deliver the answer.

## Outputs

- `advice-memos/{slug}-{YYYY-MM-DD}.md`
- Appends to `outputs.json` with `type: "advice-memo"`.