---
name: source-candidates
description: "Pull a ranked list of candidates for an open role from GitHub, LinkedIn, communities, or open-source contributors. I score each one against your role rubric so you don't have to read 200 LinkedIn pages. You can also use this skill to seed the rubric for a new req before sourcing."
version: 1
category: People
featured: yes
image: busts-in-silhouette
integrations: [github, linkedin, firecrawl]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Source Candidates

## When to use

- Explicit: "find candidates for {role}", "source engineers from GitHub", "build a sourcing list for {role}", "source 20 candidates for {role} from {signal}".
- Rubric-seed variant: "update the rubric for {role}", "set the must-haves for the {role} req"  -  ask once for level target, top 3 must-haves, top 3 nice-to-haves, 2-3 red flags, write `reqs/{role-slug}.md`, then stop (skip the scrape) so every other hiring skill reads the rubric first.
- Implicit: kicked off by founder at start of hiring push, or during req-planning session.
- Safe per-role per-signal. Keep lists short (≤ 30 per pass) so rankings meaningful.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Web scrape (Firecrawl)** — pull public profiles and signal pages. Required.
- **Engineering (GitHub)** — score OSS contributors and read repo signal. Required when source is GitHub.
- **Web scrape (LinkedIn)** — score public LinkedIn profiles. Required when source is LinkedIn.
- **ATS (Ashby, Greenhouse, Lever, Workable)** — dedupe against existing pipeline. Optional.

If none of the required categories are connected I stop and ask you to connect Firecrawl first.

## Information I need

I read your people context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Role rubric** — Required. Why I need it: I score every candidate against your must-haves. If missing I ask: "What role are we sourcing for, what level, and what are your top three must-haves?"
- **Signal source** — Required. Why I need it: I need a place to pull names from. If missing I ask: "Where should I source from, a GitHub org, a LinkedIn search, a community list, or a conference attendee list?"
- **Companies to exclude** — Optional. Why I need it: keeps people you've already passed on out of the list. If you don't have it I keep going with TBD.

## Steps
<!-- houston-workflow:v1 -->

1. **Read people-context doc** at `context/people-context.md`. If missing or empty, tell user: "I need your people context first  -  run the set-up-my-people-info skill." Stop. Extract leveling framework and existing team-shape notes for target role.
2. **Read req.** Look for `reqs/{role-slug}.md`. If missing, ask ONE targeted question ("What's the level target and the top 3 must-haves for {role}? I'll save a short rubric to `reqs/{role-slug}.md` and continue."). Write it, continue.
3. **Read ledger.** `config/context-ledger.json`  -  connected ATS (for dedup later) and open reqs list (`domains.people.reqs`).
4. **Confirm signal source** named (GitHub repo / org, LinkedIn search URL, community post / forum, conference attendee list, OSS contributor graph). If none named, ask one targeted question.
5. **Discover tools via Composio.** Run `composio search web-scrape` for LinkedIn / public-profile scraping and `composio search ats` if ATS consulted for dedup. If required category unconnected, tell user which to link from Integrations. Stop.
6. **Pull candidates.** Execute discovered tool slugs against signal source. Cap ~30 results. Per candidate, capture: name, profile / signal URL, current role + company, tenure, key skills observable in signal, one-line "why this signal is relevant" note.
7. **Score against rubric.** Per candidate, mark must-haves hit / missing vs rubric from step 2. Produce 0-3 fit band: **strong / maybe / weak**. Surface up to 3 red flags per candidate (tenure pattern, geo / authorization if stated, overlap with excluded companies per founder instruction). Never infer protected-class attributes.
8. **Write** sourcing list to `sourcing-lists/{role-slug}-{YYYY-MM-DD}.md` atomically (`*.tmp` → rename). Structure: Role summary (level + must-haves from rubric) → Top 5 highest-conviction reach-outs → Ranked table of all candidates (name, link, fit band, 1-line reason, red flags).
9. **Append to `outputs.json`**  -  read existing array, add `{ id, type: "sourcing", title, summary, path, status: "draft", createdAt, updatedAt }`, write atomically.
10. **Summarize to user**  -  one paragraph naming top 5 reach-outs, path to full list, category / tool used.

## Never invent

Every candidate must trace to real, verifiable signal URL. If profile private / 404 / ambiguous, mark candidate UNKNOWN on that field  -  no guess tenure, title, skills.

## Outputs

- `sourcing-lists/{role-slug}-{YYYY-MM-DD}.md`
- Appends to `outputs.json` with type `sourcing`.