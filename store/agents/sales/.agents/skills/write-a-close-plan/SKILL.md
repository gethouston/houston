---
name: write-a-close-plan
description: "Build a mutual action plan with the prospect: a shared timeline across procurement, security review, budget approval, and legal - with owners (yours and theirs) and dated milestones. Top three risks and any unknown stakeholder surfaced explicitly so you know what to learn on the next call."
version: 1
category: Sales
featured: no
image: handshake
x_houston:
  created_by: houston
  skill_schema: 1
---


# Write A Close Plan

Mutual action plan (MAP). Share with champion. Drive accountability both ways. Honest version  -  if economic buyer unknown, write UNKNOWN, not "decision maker".

## When to use

- "build a mutual action plan with {Acme}".
- "close plan for {Acme}".
- "what's left to close {Acme}".

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **CRM**  -  read deal record (owner, stage, amount, close date). Optional but strongly recommended.

If your CRM isn't connected I keep going from your call notes alone and ask you to paste any deal facts I'm missing.

## Information I need

I read your sales context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your sales playbook**  -  Required. Why I need it: deal stages and qualification drive what's still open in the plan. If missing I ask: "I don't have your playbook yet  -  want me to draft it now?"
- **Which deal this plan is for**  -  Required. Why I need it: I read the call history for that specific deal. If missing I ask: "Which prospect or deal should I build this close plan for?"
- **Target close date**  -  Optional. Why I need it: anchors the timeline. If you don't have it I propose one based on your typical close cycle and flag TBD.
- **Champion, economic buyer, and blocker names**  -  Optional. Why I need it: these become the rows of the plan. If you don't have them I write UNKNOWN and surface each as something to learn on the next call.

## Workflow
<!-- houston-workflow:v1 -->

1. **Read the playbook.** Load `context/sales-context.md`. Need deal stages + qualification to know what still open.

2. **Read call history for the deal.** All `calls/{id}/analysis.md` where `dealSlug` match. Extract confirmed facts vs. inferred.

3. **Compile current state:**

   - **Champion**  -  name + title, or UNKNOWN.
   - **Economic buyer**  -  name + title, or UNKNOWN.
   - **Blocker**  -  if identified, name. Else UNKNOWN.
   - **Procurement path**  -  legal review? InfoSec questionnaire? Finance sign-off? If unknown, UNKNOWN.
   - **Budget**  -  confirmed / in-plan / needs-approval / UNKNOWN.
   - **Technical validation**  -  done / scheduled / required / N/A.
   - **Target close date**  -  from user if provided, else propose based on playbook's typical close cycle.

4. **Draft plan as shared timeline**  -  ours and theirs:

   ```
   Week -4 : [us] Send proposal v2 | [them] Champion aligns with EB
   Week -3 : [them] Legal review / InfoSec | [us] Technical validation call
   Week -2 : [them] Procurement approval | [us] Contract redlines
   Week -1 : [them] Exec sign-off | [us] Final kickoff-ready state
   Week  0 : [both] Contract signed, kickoff scheduled
   ```

   Every row: owner (us / them / both), action, target date, blocker (if any).

5. **Flag UNKNOWNs prominently.** Each UNKNOWN gets bullet in "What we need to learn" section, each assigned to next call with specific question.

6. **Write atomically** to `deals/{slug}/close-plan.md.tmp` → rename. One close plan per deal  -  overwrite prior versions (but keep terse changelog at bottom: "v2  -  2026-04-23: moved close -1w due to legal review").

7. **Update `deals.json`**  -  set `closePlanAt`, `risk` (recompute GREEN/YELLOW/RED based on UNKNOWNs + date slippage).

8. **Append to `outputs.json`:**

   ```json
   {
     "id": "<uuid v4>",
     "type": "close-plan",
     "title": "Close plan  -  {Company}",
     "summary": "Target close {date} · {N} UNKNOWNs · {N} steps.",
     "path": "deals/{slug}/close-plan.md",
     "status": "draft",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>"
   }
   ```

9. **Summarize.** Target close date + top UNKNOWN user should resolve next. Suggest `prep-a-meeting type=call` for next touch.

## Outputs

- `deals/{slug}/close-plan.md`
- Updates `deals.json`.
- Appends to `outputs.json`.