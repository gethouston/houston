---
name: debrief-an-interview-loop
description: "Pull together panel feedback after an interview loop into themes, contradictions, rubric scores, and a hire / no-hire memo. You decide; I just give you the cleanest read of what the panel actually said."
version: 1
category: People
featured: no
image: busts-in-silhouette
integrations: [notion, linear, slack, loops]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Debrief an Interview Loop

## When to use

- Explicit: "synthesize {candidate}'s panel feedback", "hire or no-hire on {candidate}", "debrief the loop", "decision memo for {candidate}".
- Prerequisite: ≥2 interviewer feedback blocks exist (appended to loop file, pasted by user, or pulled via connected chat / collab tool).
- One invocation per candidate loop. Append  -  never overwrite  -  prior debriefs.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Chat (Slack, Discord)** — pull panel feedback from threads if your team writes it there. Optional.
- **Docs (Notion)** — read scorecards or feedback pages. Optional.
- **Project tracking (Linear)** — pull feedback if it's tracked as tickets. Optional.
- **Inbox (Loops or Gmail)** — read panelist feedback emails. Optional.

If none of these are connected and the loop file has no feedback blocks I ask you to paste the feedback before I synthesize.

## Information I need

I read your people context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Candidate loop record** — Required. Why I need it: I synthesize against the prep brief and the panel structure. If missing I ask: "I don't have a loop on file for this candidate. Was the loop scheduled here, or somewhere else?"
- **Panelist feedback** — Required. Why I need it: synthesis without feedback is fiction. If missing I ask: "Where's the panel feedback? I can pull it from Slack, Notion, or Linear, or you can paste it here."
- **Role rubric** — Required. Why I need it: I score the loop against your must-haves. If missing I ask: "What role and level is this candidate for, and what are your top three must-haves?"
- **Leveling framework** — Required. Why I need it: hire / no-hire bands map to your bar at this level. If missing I ask: "How would you describe what 'meeting the bar' looks like at this level?"

## Steps
<!-- houston-workflow:v1 -->

1. **Read people-context doc** at `context/people-context.md`. If missing/empty, tell user: "I need your people context first  -  run the set-up-my-people-info skill." Stop. Pull leveling framework for target level, values, hard nos, escalation rules.
2. **Read req.** Open `reqs/{role-slug}.md` for criteria rubric.
3. **Read loop file.** Open `interview-loops/{candidate-slug}.md`. If missing, tell user no loop file exists, stop.
4. **Gather interviewer feedback.** Look for `## Feedback  -  {interviewer}` sections in loop file. If user said feedback lives elsewhere, run `composio search chat` or `composio search collab` to find tool slug and fetch threads / pages user points at. If pasting: accept paste, move on. If nothing available, ask ONE question: "Where's the feedback? I can pull from Slack / Notion / Linear, or you can paste."
5. **Extract themes.** Cluster feedback into:
   - **Strengths**  -  claims multiple panelists agree on.
   - **Concerns**  -  claims multiple panelists agree on.
   - **Contradictions**  -  where panelists disagreed; surface disagreement, propose resolution (reference call, follow-up interview, skip).
   - **UNKNOWNs**  -  rubric criteria nobody covered.
6. **Score against rubric.** Per criterion, aggregate panelist scores where given; fill gaps with "not assessed" where UNKNOWN. Overall band: **hire / borderline / no-hire**.
7. **Produce decision memo.**
   - Recommendation: hire / no-hire.
   - Confidence: low / medium / high  -  and why.
   - Reasoning: 3-5 sentences linking themes + rubric scores.
   - Risks if hire: 2-3 bullets.
   - Risks if pass: 2-3 bullets (e.g. pipeline re-opens, timing).
   - Reference themes to verify  -  3-5 questions for references.
   - **Explicit "Recommendation only  -  founder decides" footer.**
8. **Check escalation rules.** If feedback touches protected-class topics, anti-discrimination concerns, or legal-sensitive matters, STOP memo, surface escalation note pointing to human lawyer per escalation-rules section in context/people-context.md. No recommendation on those grounds.
9. **Write memo.** Append dated `## Debrief  -  {YYYY-MM-DD}` section to `interview-loops/{candidate-slug}.md`. Atomic write (`*.tmp` → rename). Never overwrite prior sections.
10. **Append to `outputs.json`**  -  `{ id, type: "debrief", title, summary, path: "interview-loops/{candidate-slug}.md", status: "draft", createdAt, updatedAt }`, write atomically.
11. **Summarize to user**  -  one paragraph: recommendation, confidence, top reason, top risk, path to memo.

## Never invent

- Never invent interviewer feedback. Panelist didn't weigh in = UNKNOWN.
- Never collapse contradictions into false consensus  -  surface them.
- Never make final hire/fire call; always "Recommendation only".
- Never write under `.houston/<agent>/`.

## Outputs

- `interview-loops/{candidate-slug}.md` (decision memo appended).
- Appends to `outputs.json` with type `debrief`.