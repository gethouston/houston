---
name: log-a-decision
description: "Capture a decision properly so you have a record you can point at later. I write an ADR-style entry with context, alternatives considered, trade-offs, the decision itself, rationale, and consequences. Tell me what you decided and I keep it in your decision ledger."
version: 1
category: Operations
featured: no
image: clipboard
integrations: [linkedin]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Log A Decision

## When to use

- User says "we decided", "log the decision on", "capture that call", "ADR this".
- Pasted/connected meeting notes contain clear decision pattern.
- User asks review open decision backlog  -  skill also marks `pending` rows `decided` when user declares them.

## Connections I need

I run external work through Composio. Before this skill runs I check the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Meeting recorder** (Fireflies, Gong)  -  Optional. Lets me pull a transcript when you say "log the call we just had." If not connected I work from what you paste.
- **Docs / notes** (Notion, Google Docs)  -  Optional. If you have a decision log or RACI doc elsewhere I read it before drafting.

This skill works without any connection. I never block here  -  worst case you describe the decision and I capture it.

## Information I need

I read your operations context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **The decision itself**  -  Required. Why I need it: I'm capturing one specific call, not generating one. If missing I ask: "What did you decide, and what was on the table before you picked?"
- **Stakeholders and decider**  -  Required. Why I need it: drives whether the row lands as pending or decided. If missing I ask: "Who decided this  -  you, a co-founder, the team  -  and is it final or still open?"
- **Decision rights / RACI**  -  Optional. Why I need it: lets me default the right status without asking each time. If you don't have it I keep going with TBD and ask once: "Who owns calls like pricing, hiring, or product strategy? A sentence is fine."
- **Active priorities**  -  Required. Why I need it: I tag whether the decision is load-bearing for what you're pushing on. If missing I ask: "What are the 2 to 3 things the company is pushing on this quarter?"

## Steps
<!-- houston-workflow:v1 -->

1. **Read `context/operations-context.md`.** If missing or empty, stop and ask user run `set-up-my-ops-info` first. Active priorities anchor whether decision load-bearing.

2. **Resolve subject.** From chat, extract decision topic and propose kebab-case slug (e.g. `switch-pricing-to-seat-based`). Confirm briefly if ambiguous.

3. **Read `config/decision-framework.md`.** If missing or sparse, ask ONE question: *"Who decides pricing / product strategy / hiring / structural bets? Best: drop a RACI doc or decision-rights page from a connected wiki. Otherwise paste a sentence  -  I'll expand as more decisions land."* Write and continue.

4. **Decide `status`.** Based on framework:
   - CEO decider and not yet decided → `pending`.
   - Owner-scoped and owner declared → `decided` with `decidedBy` and `decidedAt`.
   - User is CEO and declared → `decided`.

5. **Check duplicates.** Scan `decisions.json` for existing slug or near-duplicate title. If exists, update in place (append alternatives to `considered`, refine `rationale`, move `pending` → `decided` with `decidedAt`) rather than new row.

6. **Write ADR** at `decisions/{slug}/decision.md` (atomic):

   ```markdown
   # Decision: {title}

   - **Status:** {pending | decided | superseded}
   - **Decided by:** {who, if decided}
   - **Decided at:** {ISO-8601, if decided}
   - **Linked initiatives:** {slugs}

   ## Context
   {1-2 paragraphs  -  what prompted this, what's at stake}

   ## Alternatives considered
   1. **{Option A}**  -  {short description}. Trade-offs: {...}.
   2. **{Option B}**  -  {short description}. Trade-offs: {...}.
   3. **{Option C / status quo if relevant}**  -  {...}.

   ## Decision
   {the chosen path, 1 paragraph}

   ## Rationale
   {why this one over the alternatives  -  short, honest}

   ## Consequences
   - **Good:** {what becomes easier}
   - **Hard:** {what becomes harder}
   - **Unknowns:** {what we'll learn over time}

   ## Open questions
   {anything still TBD}
   ```

7. **Upsert in `decisions.json`** with `{ slug, title, summary, status, decidedBy?, decidedAt?, linkedInitiativeSlugs, considered, rationale? }`. Keep `summary` one line  -  shows in dashboard.

8. **Sensitive matters.** If decision touches performance, compensation, exits, or legal, DO NOT land specifics in indexed `summary`. Generalize ("Exec transition on {domain}" rather than named), keep full narrative only in per-decision markdown file, flag privately to founder in chat.

9. **Append to `outputs.json`** with `type: "decision"`, status "ready" (decision is artifact of record).

10. **Summarize in chat.** One sentence: what logged, status, where lives.

## Outputs

- `decisions/{slug}/decision.md` (new or overwritten)
- Upserted `decisions.json`
- Possibly updated `config/decision-framework.md` (progressive capture)
- Appends to `outputs.json` with `type: "decision"`.

## What I never do

- **Decide for you**  -  `log-a-decision` captures; CEO decides.
- **Land sensitive specifics** in shared indexed rows.
- **Overwrite superseded decision** silently  -  mark old `status: "superseded"` and link new one.
- **Invent alternatives**  -  if user only told chosen path, ask one question for 1-2 realistic alternatives on table.