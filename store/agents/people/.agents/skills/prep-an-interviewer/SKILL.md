---
name: prep-an-interviewer
description: "Get a one-page interview prep brief before you (or a panelist) walk in  -  candidate background, the questions worth asking, red flags from the rubric, and the scoring sheet. Scannable in two minutes."
version: 1
category: People
featured: no
image: busts-in-silhouette
integrations: [notion, linkedin, loops]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Prep an Interviewer

## When to use

- Explicit: "prep me to interview {candidate}", "what should I ask {candidate}", "interview brief for {candidate}", "brief me for {candidate} loop".
- Implicit: called as dependency by `coordinate-an-interview-loop`  -  every panelist needs tailored brief.
- One invocation = one interviewer-side brief. Panel briefing? Call per interviewer via `coordinate-an-interview-loop`.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Docs (Notion, Google Docs)** — read prior interview rubrics or share the brief if you keep them in a shared workspace. Optional.
- **Web scrape (LinkedIn)** — refresh background facts from a public profile if the candidate record is thin. Optional.
- **Inbox (Loops or Gmail)** — pull prior candidate-thread context for the interviewer brief. Optional.

This skill reads mostly local files, so missing connections won't block me — I'll just work with what's already in your candidate record.

## Information I need

I read your people context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Candidate record** — Required. Why I need it: every claim in the brief traces to it. If missing I ask: "Run a screen on this candidate first by dropping the resume or sharing the LinkedIn URL, so I have something to brief from."
- **Role rubric** — Required. Why I need it: I score interview questions against your must-haves. If missing I ask: "What role is this candidate for, and what are your top three must-haves?"
- **Interviewer name and focus area** — Required. Why I need it: each panelist owns different rubric criteria. If missing I ask: "Who's running this interview, and what's their focus, technical, systems, leadership, or values?"
- **Leveling framework** — Required. Why I need it: scoring rubric is tied to the bar at this level. If missing I ask: "What level are we hiring for, and how would you describe what 'meeting the bar' looks like at that level?"

## Steps
<!-- houston-workflow:v1 -->

1. **Read people-context doc** at `context/people-context.md`. Missing/empty? Tell user: "I need your people context first  -  run the set-up-my-people-info skill." Stop. Pull leveling framework, values, escalation rules.
2. **Read req.** Open `reqs/{role-slug}.md` for criteria rubric. Missing? Ask ONE targeted question, write it.
3. **Read candidate record.** Open `candidates/{candidate-slug}.md`. Missing? Tell user: "No record for {candidate}. Run `screen-resume` or `score-candidate` first so I have something to brief from." Stop.
4. **Read existing loop file** if present at `interview-loops/{candidate-slug}.md`  -  avoid duplicating questions assigned to other panelists.
5. **Ask for interviewer focus** if not stated  -  ONE question: "Who's conducting the interview and what's their focus area (e.g. technical, systems, leadership, values)?" Scopes which rubric criteria interviewer owns.
6. **Build brief.** Structure:
   - **Candidate background summary**  -  3-5 sentences from candidate record. No invention; cite source per claim (screen / LinkedIn / sourcing signal).
   - **This interviewer's focus areas**  -  2-3 rubric criteria they own for loop.
   - **6-10 likely questions** scoped to focus areas, each with one-line "what strong answer looks like".
   - **3-5 red flags to probe**  -  from candidate record's red-flag list. Include question to surface each flag.
   - **Reference themes**  -  topics for future reference call (if loop progresses).
   - **Scoring rubric**  -  per question: 0-3 bar with exemplars, tied to people-context leveling framework for this level.
7. **Write to `interview-loops/{candidate-slug}.md`.** Append new dated `## Interviewer brief  -  {interviewer name}  -  {YYYY-MM-DD}` section  -  never overwrite. File missing? Create with header stub then brief section. Atomic write (`*.tmp` → rename).
8. **Append to `outputs.json`**  -  `{ id, type: "interview-prep", title, summary, path: "interview-loops/{candidate-slug}.md", status: "draft", createdAt, updatedAt }`, write atomically.
9. **Summarize to user**  -  one paragraph: interviewer named, focus areas, top 3 questions, path to loop file.

## Never invent

- Every candidate claim in background summary must trace to candidate record. UNKNOWN there = UNKNOWN here.
- Never draft questions probing protected-class attributes.
- Never generate candidate-side prep (what candidate should say)  -  this skill interviewer-side only.

## Outputs

- `interview-loops/{candidate-slug}.md` (appended; created if missing).
- Appends to `outputs.json` with type `interview-prep`.