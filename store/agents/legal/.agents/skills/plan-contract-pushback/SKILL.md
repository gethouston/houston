---
name: plan-contract-pushback
description: "After reviewing a contract, plan exactly what to push back on. I sort the issues into must-haves, nice-to-haves, and not-worth-fighting, write the exact wording you can paste into your counter-email, and add a fallback if the other side says no. You need to have reviewed the contract first."
version: 1
category: Contracts
featured: no
image: scroll
x_houston:
  created_by: houston
  skill_schema: 1
---

# Plan Contract Pushback

## When to use

- "Draft redline strategy for {counterparty} contract" / "what push back on?" / "prioritize redlines  -  limited leverage".
- After `review-a-contract` (mode=full) surfaces Yellow + Red clauses, founder needs negotiation sequence.

Run once per contract version after review. Counterparty counters → run again on new version.

## Steps
<!-- houston-workflow:v1 -->

1. **Read shared context.** Load `legal-context.md` for founder risk posture + escalation rules. Load `config/posture.json` for clause-level walk-away positions.

2. **Read upstream review.** Find matching `contract-reviews/{counterparty-slug}-{YYYY-MM-DD}.md`. Missing → stop and ask the user in plain language: "I haven't reviewed this contract yet. Want me to do that first?" Don't proceed until that's done. Pull full clause table (Green / Yellow / Red + current text + market standard).

3. **Ask founder two things if unknown.** Both in one message, not two turns:
   - **Goal for deal**  -  close fast / protect IP / limit liability / walk-away leverage / keep optionality for later rounds?
   - **Counterparty leverage**  -  who whale? Customer needed this quarter, or 3 other pipeline deals at similar ACV? Honest read.

4. **Sort every Yellow + Red clause into three tiers:**

   - **Must-have redlines**  -  won't sign without. Week-0 founder defaults: uncapped liability cap replaced with cap anchored to fees; IP assignment of core product struck; one-way indemnity against us made mutual; AI-training carve-out training on our data struck; non-compete on us struck. Adjust based on founder posture + leverage.
   - **Nice-to-have redlines**  -  push if leverage, punt if not. Examples: termination for convenience 30-day notice instead of 60, wider breach-notification SLA, broader exit / data-retrieval rights.
   - **Can-punt**  -  Yellows marked "keep as-is, livable". One-line reason per item so founder knows why not pushing.

5. **Write exact redline language for every must-have.** Not "ask for liability cap"  -  actual replacement text. Example:

   > **Clause 8.2 (Liability Cap).** Replace
   > "EACH PARTY'S LIABILITY SHALL BE UNLIMITED" with
   > "EACH PARTY'S AGGREGATE LIABILITY SHALL NOT EXCEED FEES PAID OR
   > PAYABLE IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM." Market
   > standard for SaaS deals at our ACV band; uncapped liability is
   > a walk-away.

   One-line rationale per must-have founder can paste verbatim into counter-email.

6. **For each must-have, include fallback ladder.** Won't accept must-have → next acceptable step down? Order best-for-us to last-acceptable. Example for liability cap: `1x annual fees` → `12mo fees` → `2x annual fees` → `2x annual fees but only for IP / breach carve-outs`.

7. **Write ask / offer framing.** Concrete sentences founder pastes into response email:
   - "We can sign this week if we can land the three items below; everything else is acceptable."
   - List 3 must-haves inline (redline + rationale).
   - "The remaining {N} points we flagged in our review are acceptable as written."

8. **Flag `attorneyReviewRequired: true`** if:
   - Any must-have requires IP, securities, or privacy language without market standard citation.
   - Counterparty already refused must-have in prior round (founder considering accepting).
   - Deal > $100K ACV.
   - Any clause in review marked `UNKNOWN`.

9. **Draft plan (markdown, ~500-800 words).** Structure:

   1. **Header**  -  counterparty, contract type, review date, goal, leverage read.
   2. **Must-have redlines**  -  numbered list. Each item: current text (quoted), replacement text (verbatim), rationale (one sentence), fallback ladder.
   3. **Nice-to-have redlines**  -  numbered list. Each item: current text, target, one-line rationale, push or punt given leverage read.
   4. **Can-punt**  -  bulleted. One-line reason per item.
   5. **Ask / offer framing**  -  paste-ready paragraph.
   6. **Attorney review flag**  -  yes / no + reason if yes.
   7. **Next move**  -  "send this to counterparty", "escalate", or "hold pending {specific info needed}".

10. **Write atomically** to `redline-plans/{counterparty-slug}-{YYYY-MM-DD}.md`  -  `{path}.tmp` then rename.

11. **Append to `outputs.json`.** Read-merge-write atomically:

    ```json
    {
      "id": "<uuid v4>",
      "type": "redline-plan",
      "title": "Redline plan  -  <counterparty>",
      "summary": "<2-3 sentences  -  must-have count + the top one + framing>",
      "path": "redline-plans/<slug>-<YYYY-MM-DD>.md",
      "status": "draft",
      "attorneyReviewRequired": <true | false>,
      "createdAt": "<ISO-8601>",
      "updatedAt": "<ISO-8601>"
    }
    ```

12. **Summarize to user.** One short paragraph in plain language: how many must-haves, the most important one, the offer line they can paste, and the next move. Never name files or paths.

## Outputs

- `redline-plans/{counterparty-slug}-{YYYY-MM-DD}.md`
- Appends to `outputs.json` with `type: "redline-plan"`.