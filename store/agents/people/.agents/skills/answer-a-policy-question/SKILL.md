---
name: answer-a-policy-question
description: "Answer a people policy question, like 'does {employee} qualify for {benefit}' or 'what's our policy on remote work, equipment, or leave'. You get a direct answer when the policy is clear, an escalation note when the question goes beyond your written rubric."
version: 1
category: People
featured: no
image: busts-in-silhouette
integrations: [googledocs, gmail, notion, slack]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Answer a Policy Question

## When to use

- Explicit: "does {employee} qualify for {PTO / leave / parental /
  bereavement / remote}", "can {employee} expense {X}", "what's our
  policy on {topic}", "is this covered".
- Template variant: "draft the PTO (or {topic}) reply template", "give
  me reusable variants for {policy} asks"  -  produce all three reply
  paths (direct / ambiguous / escalation) for the named topic and save
  to `approvals/{topic}-reply-template.md` for reuse.
- Implicit: routed from helpdesk-channel watcher (Slack listener,
  Gmail filter) when team member asks HR question.
- Frequency: as often as team members ask. Classifier run
  every time.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Docs (Google Docs, Notion)** — read the handbook or policy doc when it lives outside this agent. Optional.
- **Inbox (Gmail)** — match your reply voice. Optional.
- **Chat (Slack)** — reply where the question came in. Optional.

This skill never sends without your sign-off, so no integration is strictly required — but a connected handbook keeps me from asking questions you've already answered.

## Information I need

I read your people context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **The question being asked** — Required. Why I need it: I classify and answer the specific ask. If missing I ask: "What's the question, and who's asking?"
- **Policy canon** — Required. Why I need it: every direct answer cites the relevant policy. If missing I ask: "Drop your current handbook or share a link to it, or run set-up-my-people-info first to capture the policies."
- **Escalation rules** — Required. Why I need it: I never draft answers on discrimination, harassment, wage, or visa-law questions — I route them. If missing I ask: "Who do discrimination, harassment, wage-dispute, and visa questions route to. Is there a named lawyer, or should we mark it TBD until you have one?"
- **Jurisdiction** — Optional. Why I need it: leave and benefits answers vary by state and country. If you don't have it I keep going with TBD and surface jurisdictional gaps in the draft.

## Steps
<!-- houston-workflow:v1 -->

1. **Read people-context doc.** Read
   `context/people-context.md`. If missing or empty, tell
   user: "I need your people-context doc first  -  run the set-up-my-people-info skill." Stop.
2. **Read escalation rules section specifically** from
   `context/people-context.md`. Define which categories route to
   human lawyer / founder (typically: discrimination, harassment,
   wage disputes, visa legal opinions, protected-class performance
   actions). Hold list explicit in scope before classify.
3. **Classify incoming question into exactly one of three
   buckets:**

   - **Direct answer**  -  question covered by policy canon
     in `context/people-context.md` (leave · benefits · expenses · remote ·
     travel · equipment) AND does NOT match any escalation category.
     → Proceed to Step 4 to draft reply.
   - **Ambiguous**  -  policy canon silent or unclear on this
     question, question does NOT match escalation
     category. → Draft recommended answer AND flag as "needs
     founder review" before sending. No ship without founder
     sign-off.
   - **Escalation required**  -  question matches one of
     escalation rules (discrimination, harassment, wage disputes,
     visa law, protected-class performance actions, or anything
     else defined in `context/people-context.md` escalation section).
     → **DO NOT draft policy answer.** Skip to Step 6  -  draft
     escalation note instead.

   Record chosen bucket. Every output in `policy-answers/` and
   every `outputs.json` entry carries this classification.

4. **For direct answers  -  read voice + draft reply.** Read
   `config/voice.md` if exists AND voice-notes section of
   `context/people-context.md`. Draft reply in that voice, cite
   specific policy section (e.g. "Per our PTO policy in
   context/people-context.md § Policy canon  -  15 days accrued after 90-day
   probation…"). Keep direct, no hedging.
5. **For ambiguous answers  -  draft + flag.** Same voice. Draft
   recommended answer that names unclear policy area, proposes
   interpretation, opens with clear "Founder review
   needed before sending  -  policy canon silent on {X}."
6. **For escalations  -  draft escalation note, not answer.**
   Write short note routing question to named human per
   escalation rules (founder / human lawyer). Note states:
   (a) category that triggered escalation, (b) one-line
   paraphrase of question (redact sensitive personal details
   where possible), (c) explicit instruction to NOT respond to
   asker directly until named human reviewed. No policy
   drafting. No legal opinion.
7. **Write** artifact atomically to
   `policy-answers/{slug}.md` (`*.tmp` → rename). Frontmatter or
   top-of-file header records:
   - `classification: direct | ambiguous | escalation`
   - `asker: {name}` (if known)
   - `question: {one-line paraphrase}`
   - `routedTo: {founder | human-lawyer |  - }` (for
     ambiguous/escalation)
8. **Append to `outputs.json`**  -  read existing array, add
   `{ id, type: "policy-answer", title, summary, path, status:
   "draft", createdAt, updatedAt }`. `summary` leads with
   classification bucket ("ESCALATION  -  visa-law question routed to
   human lawyer per people-context § Escalation rules"). Write
   atomically.
9. **Summarize to user**  -  one paragraph naming classification
   bucket, path to artifact, what happens next
   (send after sign-off / wait for founder review / wait for
   lawyer). Never imply reply sent.

## Hard rules

- **Never draft policy answer for escalation-category question.**
  Even if answer seems obvious. Route it.
- **Never send reply without founder sign-off** when classification
  is `ambiguous` or `escalation`.
- **Never invent policy canon.** If silent, say so and
  classify `ambiguous`.
- **Never reveal one employee's confidential data to another**
  without explicit authorization.

## Outputs

- `policy-answers/{slug}.md` (with classification recorded at top).
- Appends to `outputs.json` with type `policy-answer` and
  classification bucket in summary.