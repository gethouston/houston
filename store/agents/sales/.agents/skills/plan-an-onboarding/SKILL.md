---
name: plan-an-onboarding
description: "Plan a new customer's first ninety days: kickoff agenda, success metric locked in their words at kickoff, time-to-value milestones, named champions and blockers, and the first-thirty-day risk list. The anchor every later account review and renewal pulls from."
version: 1
category: Sales
featured: no
image: handshake
x_houston:
  created_by: houston
  skill_schema: 1
---


# Plan An Onboarding

First artifact post-close. Sets success metric explicit so health score honest against it next year.

## When to use

- "plan the onboarding for {customer}".
- "kickoff plan for {customer}".
- Post-close trigger when close-plan status flips `closed-won`.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **CRM**  -  read the closed deal record (account, contacts, amount, term). Optional but recommended.
- **Calendar**  -  schedule the kickoff once you approve. Optional.

I can run this skill from your existing close-plan and proposal alone, so no connection is hard-required.

## Information I need

I read your sales context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your sales playbook**  -  Required. Why I need it: it carries your standard success-metric framing and time-to-value cadence. If missing I ask: "I don't have your playbook yet  -  want me to draft it now?"
- **Which customer this is for**  -  Required. Why I need it: I read that deal's close-plan and proposal to lift their stated problem. If missing I ask: "Which customer is this onboarding for?"
- **Their success metric in their words**  -  Required. Why I need it: the plan is anchored to the metric they care about, not ours. If missing I ask: "How will the customer know this worked  -  what did they say success looks like?"
- **Kickoff date**  -  Optional. Why I need it: anchors the 90-day timeline. If you don't have it I keep going with TBD and propose a date based on contract start.

## Workflow
<!-- houston-workflow:v1 -->

1. **Read the playbook.** `context/sales-context.md`.

2. **Read this agent's close-plan + proposal.** `deals/{slug}/
   close-plan.md` and `proposal-v*.md` (latest). Extract: customer
   problem, their success metric (verbatim), champion, economic
   buyer, stakeholders, timeline.

3. **Read config/success-metric.json**  -  our canonical framing.
   Cross-reference vs THEIR metric. Flag divergence.

4. **Draft onboarding plan:**

   1. **Kickoff agenda**  -  5–7 items, 60 min. Intros, success metric
      confirmation (we restate, THEY confirm verbally), access /
      provisioning, team handoff, cadence.
   2. **Success metric (explicit)**  -  both versions: ours + theirs.
      If diverge, state which one drives first-90 health score.
   3. **90-day time-to-value timeline:**
      - Day 0  -  kickoff.
      - Day 7  -  access + first use.
      - Day 14  -  first value milestone (concrete, measurable).
      - Day 30  -  first outcome review.
      - Day 60  -  mid-term adjustment.
      - Day 90  -  first quarterly outcome.
   4. **Champions + blockers**  -  named. Execs to introduce.
   5. **First-30-day risk list**  -  anything visible that could
      derail.

5. **Write atomically** to `customers/{slug}/onboarding.md.tmp` →
   rename. Create `customers/{slug}/` if missing.

6. **Create row in `customers.json`**  -  `health: "GREEN"`,
   `startedAt: <ISO>`, `renewalAt` = kickoff + term, etc.

7. **Append to `outputs.json`** with `type: "onboarding"`.

8. **Summarize.** Explicit success metric + 30-day milestone.

## Outputs

- `customers/{slug}/onboarding.md`
- New row in `customers.json`.
- Appends to `outputs.json`.