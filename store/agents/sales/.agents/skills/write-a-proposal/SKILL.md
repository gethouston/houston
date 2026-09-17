---
name: write-a-proposal
description: "Draft a one-page proposal grounded in the deal: their verbatim problem statement, your proposed approach, scope (in and out), pricing within your playbook's stance, terms, success metrics, timeline, and next step. Anything outside your pricing non-negotiables gets flagged for your approval, never silently committed."
version: 1
category: Sales
featured: no
image: handshake
x_houston:
  created_by: houston
  skill_schema: 1
---


# Write A Proposal

One-pager proposal. Not SOW  -  tight, one-page doc champion forward to economic buyer + procurement.

## When to use

- "draft a proposal for {Acme}".
- "one-pager proposal for {Acme}".
- "I need to send {Acme} a quote / scope".

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **CRM**  -  read deal record (owner, stage, amount, contacts). Optional but recommended.
- **Meetings**  -  pull prior call transcripts to lift verbatim problem statements and success metrics. Optional.

If neither is connected I keep going from your existing notes and ask for the deal facts I'm missing.

## Information I need

I read your sales context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your sales playbook**  -  Required. Why I need it: pricing bands, discount policy, and minimum viable terms have to come from your stance, not a guess. If missing I ask: "I don't have your playbook yet  -  want me to draft it now?"
- **Which deal this proposal is for**  -  Required. Why I need it: I lift the verbatim problem statement and success metric from that deal's call history. If missing I ask: "Which prospect or deal is this proposal for?"
- **Their verbatim problem statement and success metric**  -  Required. Why I need it: a one-pager only lands when the problem is in their words. If missing from call notes I ask: "How did the prospect describe the problem in their words, and what metric will tell them it worked?"
- **Pricing assumptions (user count, term, volume)**  -  Required. Why I need it: I need to show the math, not invent it. If missing I ask: "What are we proposing  -  how many seats or what volume, what term length?"

## Workflow
<!-- houston-workflow:v1 -->

1. **Read the playbook.** Load `context/sales-context.md`. Required. Without it, stop.

2. **Read pricing.** From playbook pricing-stance section. Know bands, discount policy, non-negotiable. **Never draft below non-negotiable.** If deal need that, write UNKNOWN + flag for approval.

3. **Read deal history**  -  all call notes + analyses under `calls/` filtered by `dealSlug`. Extract: problem statement (verbatim), success metric (verbatim), stakeholders, timeline.

4. **Draft proposal (~300–450 words):**

   1. **Problem statement**  -  THEIR words, cite which call.
   2. **Proposed approach**  -  one paragraph, concrete. No buzzwords.
   3. **Scope**  -  in: bulleted. Explicitly OUT: bulleted. Out-of-scope list important as in  -  prevents scope creep.
   4. **Pricing**  -  proposed band, assumptions (user count, volume, term), any discount applied (within policy). Show math.
   5. **Terms**  -  minimum viable terms from playbook, adjusted only within discount policy.
   6. **Success metrics**  -  how both know worked. Pulled from call notes; metric they told us mattered.
   7. **Timeline**  -  kickoff, value-in-{N}-weeks milestones.
   8. **Next step**  -  who signs, who legal-reviews, target close date (from `close-plan.md` if exists).

5. **Sanity-check vs playbook.** Any commitment outside pricing stance or terms flagged inline with `FLAG: needs approval  -  exceeds {non-negotiable}`. Surface to user in summary, not buried.

6. **Versioning.** If prior proposal exists, increment version. First draft = `proposal-v1.md`; next = `v2.md`. Never overwrite.

7. **Write atomically** to `deals/{slug}/proposal-v{N}.md.tmp` → rename.

8. **Update `deals.json`**  -  set `lastProposalAt`, `proposalVersion`.

9. **Append to `outputs.json`:**

   ```json
   {
     "id": "<uuid v4>",
     "type": "proposal",
     "title": "Proposal v{N}  -  {Company}",
     "summary": "<scope one-liner + pricing band>",
     "path": "deals/{slug}/proposal-v{N}.md",
     "status": "draft",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>"
   }
   ```

10. **Summarize.** Pricing ask + flags need user decision. Path to full proposal. Never send.

## Outputs

- `deals/{slug}/proposal-v{N}.md`
- Updates `deals.json`.
- Appends to `outputs.json`.