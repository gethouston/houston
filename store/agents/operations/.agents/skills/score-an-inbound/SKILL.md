---
name: score-an-inbound
description: "Score any inbound that needs your decision against a real rubric instead of going by gut. Drop in an advisor pitch, a partnership ask, a press request, or a generic vendor application and I run it against your saved criteria, gather public-signal evidence, and produce an approve / decline / more-info recommendation with the one line of evidence that matters most."
version: 1
category: Operations
featured: no
image: clipboard
x_houston:
  created_by: houston
  skill_schema: 1
---


# Score An Inbound

Generic approval-rubric runner for any inbound needing founder decision. Vendor-specific supplier triage → `vet-a-vendor` skill (procurement criteria, different folder).

## When to use

- "review this vendor application against our criteria" (supplier-specific → `vet-a-vendor`).
- "score these advisor candidates".
- "is this partnership a fit".
- "should I accept this press request".
- "run the approval flow on this".

## Connections I need

I run external work through Composio. Before this skill runs I check the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Web research** (Exa, Perplexity, Firecrawl)  -  Required. Pulls public signals on the submitter to verify claims and surface red flags.
- **Inbox** (Gmail, Outlook)  -  Optional. Lets me check prior correspondence with the submitter so the recommendation reflects history.

If no web research provider is connected I stop and ask you to connect a research provider first.

## Information I need

I read your operations context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **The submission itself**  -  Required. Why I need it: I score what's in front of me. If missing I ask: "Drop the submission  -  pitch, application, request  -  or paste the email thread."
- **Approval rubric**  -  Required. Why I need it: ad-hoc scoring isn't reproducible. If missing I ask: "What criteria should I use? Paste them, or say 'default' and I'll save a starter rubric for this kind of inbound that you can edit later."
- **Active priorities**  -  Required. Why I need it: the fit-to-priorities score keys off these. If missing I ask: "What are the 2 to 3 things the company is pushing on this quarter?"
- **Hard nos**  -  Optional. Why I need it: lets me decline anything that violates them on sight. If you don't have it I keep going with TBD using workspace defaults.

## Steps
<!-- houston-workflow:v1 -->

1. **Read `context/operations-context.md`.** Active priorities, hard nos, founder-specific positions anchor every rubric eval. Missing → `set-up-my-ops-info` first, stop.

2. **Read `config/approval-rubrics.md`.** Map inbound-type to rubric. Missing file or no matching rubric → ask founder: "What criteria should I use? Paste them, or I can save a default rubric for {inbound-type} you can edit later."

   **Default rubrics** (used if founder says "default"):

   - **vendor-app** (generic inbound vendor / seller): fit-to-priorities, size/stage-match, red-flags-search (public incidents), reference-check (Y/N), friction-to-try.
   - **advisor**: domain-authority, access (who they'd open), time-commitment, compensation-alignment.
   - **partnership**: mutual-audience, mutual-capability, asymmetric-upside (do they need us more than we need them), off-ramp-cost.
   - **press**: audience-fit, question-quality, founder-time-cost, reputational-upside.

3. **Gather evidence.**
   - Read submission founder pastes or links.
   - `composio search research` → public signals on submitter (website, recent activity, mentions).
   - `composio search inbox` → prior correspondence with person or domain.
   - Submission claims verifiable → verify (e.g. "raised Series B last month" → quick news check).

4. **Score against rubric.**
   - Each criterion: rating (1-5 or green/yellow/red per rubric) + 1-2 lines evidence. Cite links.
   - Overall: weighted sum if rubric specifies weights; else rolled-up qualitative call.

5. **Produce recommendation.**
   - **Approve**  -  fit + no red flags + strong evidence.
   - **Decline**  -  clear mismatch or red flags; state top 2 reasons.
   - **More info**  -  on the fence; list 2-3 specific questions founder should ask to break tie.

6. **Write** to `approvals/{slug}.md` with:
   - Submission summary (1 paragraph).
   - Rubric + scoring table (criterion | rating | evidence).
   - Public-signal findings.
   - Prior-correspondence summary (if any).
   - Recommendation + 3-line rationale.
   - If "more info", exact follow-up questions.

7. **Atomic writes**  -  `*.tmp` → rename.

8. **Append to `outputs.json`** with `type: "approval"`, status "draft" (founder marks `ready` after deciding).

9. **Summarize to user**  -  recommendation + one most load-bearing line of evidence. Never "approve" without naming #1 thing that would make founder regret it.

## Outputs

- `approvals/{slug}.md`
- Appends to `outputs.json` with `type: "approval"`, status "draft".

## What I never do

- **Commit the decision.** I recommend; founder approves/declines.
- **Send acknowledgement or rejection email to submitter.** That `draft-a-message`'s job after founder decides.
- **Use rubric not stored.** Asked to score without rubric → ask for one first. Ad-hoc scoring not reproducible.