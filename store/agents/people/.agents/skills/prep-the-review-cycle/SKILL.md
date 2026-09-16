---
name: prep-the-review-cycle
description: "Prep your next performance-review cycle  -  self-review template, manager template, calibration doc, and the full timeline. Anchored on your review rhythm and leveling so it doesn't feel generic."
version: 1
category: People
featured: yes
image: busts-in-silhouette
integrations: [googledocs, notion]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Prep the Review Cycle

## When to use

- Explicit: "prep the review cycle", "Q{N} reviews are starting",
  "build the review templates", "set up the next review cycle".
- Implicit: triggered by `weekly-people-review` when upcoming
  cycle date from `context/people-context.md` within lead-time window.
- Frequency: one per cycle. Founder want refresh mid-cycle?
  re-run, supersede.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Docs (Google Docs, Notion)** — share the templates with managers and ICs. Optional.
- **HR platform (Gusto, Deel, Rippling, Justworks)** — pull the current roster for calibration. Optional.

This skill drafts artifacts locally, so missing connections won't block me — I just won't push templates out automatically.

## Information I need

I read your people context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Review cycle rhythm** — Required. Why I need it: shapes the timeline and the cycle slug. If missing I ask: "Are reviews annual, semi-annual, or quarterly, and when does the next cycle start and end?"
- **Leveling framework** — Required. Why I need it: prompts and rubrics map to attributes per level. If missing I ask: "How would you describe each level, what scope, autonomy, and impact looks like at L1 through L5?"
- **Rating scale** — Optional. Why I need it: the manager template uses your scale instead of a generic one. If you don't have it I keep going with a four-band default and TBD where your scale would slot in.
- **Comp bands** — Optional. Why I need it: lets the calibration doc flag comp moves crossing band edges. If you don't have it I keep going with TBD on the comp sanity check.
- **Roster** — Required. Why I need it: calibration doc lists who's reviewing whom. If missing I ask: "Connect your HR platform so I can pull the team, or paste the current roster."

## Steps
<!-- houston-workflow:v1 -->

1. **Read people-context doc:**
   `context/people-context.md`. Missing or empty? tell
   user run `set-up-my-people-info` first, stop. Read
   **leveling framework**, **comp bands** (for calibration
   sanity-check), **review-cycle rhythm**, **voice notes**.
2. **Read config:** `config/context-ledger.json`. Review-cycle rhythm unset? use
   one in `context/people-context.md`. Roster source
   `connected-hr-platform`? pull current team via `composio search hris`.
3. **Resolve cycle slug.** Default `YYYY-q{N}` (e.g.
   `2026-q2`) for quarterly, `YYYY-h{N}` for semi-annual, `YYYY`
   for annual. Ask user if default mismatch
   internal naming.
4. **Produce four artifacts** in one markdown file:

   - **Self-review template**  -  prompt blocks scoped to leveling
     framework. One section per level attribute (scope, autonomy,
     craft, collaboration, impact) with 1-2 open prompts each. Keep
     prompts short  -  founders' early team won't write 1500-word
     self-reviews, don't want them to.

   - **Manager-review template**  -  same attribute scaffolding,
     plus overall-rating rubric drawn from cycle's rating
     scale (if `context/people-context.md` defines one) and
     promotion-readiness flag per person. Include section for
     "specific examples observed this cycle"  -  evidence-first, not
     vibes.

   - **Calibration doc**  -  cross-team view for:
     - Leveling consistency (L3 ICs reviewed against
       same bar across teams?).
     - Comp-bump sanity check (comp bands exist? flag any
       proposed comp change crossing band edges).
     - Promotion candidates surface (who flagged
       promotion-ready; cross-check tenure-at-level from
       `context/people-context.md` if defined).

   - **Timeline**  -  dated milestones from today to delivery:
     self-reviews due → manager-reviews due → calibration meeting →
     comp letters finalized → delivery 1:1s held. Derive concrete
     dates from cycle's start/end window; mark any needing
     founder input.

5. **Voice check.** Pull voice notes from `context/people-context.md`  -
   template prompts and calibration doc should sound like
   founder's HR voice, not generic HR-ese.

6. **Write** to `review-cycles/{cycle-slug}.md` atomically
   (`*.tmp` → rename). Structure: Cycle overview → Timeline →
   Self-review template → Manager-review template → Calibration doc.

7. **Append to `outputs.json`**  -  read existing array, add
   `{ id, type: "review-cycle", title, summary, path, status: "draft",
   createdAt, updatedAt }`, write atomically. Status stays `draft`
   until founder approves cycle structure  -  flip to `ready`
   on sign-off.

8. **Summarize to user**  -  one paragraph covering cycle slug,
   timeline highlights, path to package. Close with: "These
   are drafts. Review the templates and the timeline, then tell me
   to mark ready and I'll flip status  -  nothing goes to the team
   until you sign off."

## Never invent

Don't invent leveling framework or rating scale founder
hasn't written. If `context/people-context.md`'s leveling section `TBD`,
tell user: "I can draft generic prompts, but templates land
much better once `draft-leveling-framework` is run." Proceed with
clearly-marked generic template only if user explicitly asks.

## Outputs

- `review-cycles/{cycle-slug}.md`
- Appends to `outputs.json` with type `review-cycle`.