---
name: profile-an-employee
description: "Pull together everything I know about an employee into a one-pager  -  HR profile, onboarding plan, recent check-ins, interview loop history. Useful before a 1:1, a comp conversation, or a hard meeting."
version: 1
category: People
featured: no
image: busts-in-silhouette
integrations: [notion, slack, loops]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Profile an Employee

## When to use

- Explicit: "tell me about {employee}", "pull everything on {employee}", "prep me for my 1:1 with {employee}", "dossier on {employee}".
- Implicit: routed before review cycle, sensitive conversation (performance improvement plan, promotion, comp change), or exit interview.
- Frequency: on-demand per employee.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **HR platform (Gusto, Deel, Rippling, Justworks)** — read role, level, tenure, manager, comp, work authorization. Required.
- **Chat (Slack)** — pull recent thread context if relevant. Optional.
- **Docs (Notion)** — pull review notes or 1:1 docs if you keep them there. Optional.
- **Inbox (Loops)** — pull recent comms if useful. Optional.

If your HR platform isn't connected I stop and ask you to link Gusto, Deel, Rippling, or Justworks from the Integrations tab.

## Information I need

I read your people context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Employee identity** — Required. Why I need it: I won't pull a dossier for someone I can't pin down. If missing I ask: "Which employee, full name, and team if you have it?"
- **Authorization to view confidential fields** — Required when comp or visa data is requested. Why I need it: I never leak one employee's comp or status to another without it. If missing I ask: "Should this dossier include comp and work-authorization details, or keep it to role and tenure only?"
- **Roster source** — Required when HR platform isn't connected. Why I need it: I need somewhere to read the basics. If missing I ask: "Connect your HR platform so I can pull this directly, or paste the employee record."

## Steps
<!-- houston-workflow:v1 -->

1. **Read people-context doc.** Read `context/people-context.md` for leveling, comp bands, confidentiality rules around dossier content. If missing/empty, tell user: "I need the people-context doc first  -  run the set-up-my-people-info skill." Stop.
2. **Read ledger.** `config/context-ledger.json`. If HR platform not connected and no roster link recorded, ask ONE targeted question with modality hint  -  "Connect your HR platform (Gusto, Deel, Rippling, or Justworks) in Integrations tab, or paste employee record." Write resolution, continue.
3. **Confirm authorization.** Confirm requester authorized to see confidential data for this employee. Never reveal one employee's confidential data (comp, performance, medical, immigration) to another without explicit authorization.
4. **Discover HR platform tool**  -  run `composio search hris` for read-only profile slug. Pull: role, level, tenure, manager, location, comp (if authorized), work-authorization / visa status (if authorized), start date.
5. **Local source pulls (read-only).**
   - `onboarding-plans/{employee-slug}.md`  -  if this agent onboarded them. Skim Day-30/60/90 hits + misses.
   - `checkins/`  -  scan most-recent check-ins referencing this employee-slug.
   - `retention-scores/`  -  most recent score for this employee-slug.
   - `interview-loops/{employee-slug}.md`  -  if past candidate, pull panel-debrief signal.
   - If any sibling agent dir missing (standalone install), silently skip, note "N/A  -  sibling not installed" in dossier.
6. **Compose dossier** with four sections:
   - **Profile**  -  name, role, level, tenure, manager, location, work-authorization status (if authorized).
   - **History**  -  hire path (recruiter → offer → start), onboarding highlights, level changes, comp changes (if authorized).
   - **Recent signals**  -  1:1 themes from last N check-ins, retention score + trend, recent approvals run through this agent.
   - **Upcoming**  -  next review date, visa expiry (if any), equity cliff (if any), next milestone from onboarding plan.
7. **Write** dossier atomically to `dossiers/{employee-slug}.md` (`*.tmp` → rename). Keep to one scannable page.
8. **Append to `outputs.json`**  -  read existing array, add `{ id, type: "dossier", title, summary, path, status: "draft", createdAt, updatedAt }`. Write atomically.
9. **Summarize to user**  -  one paragraph with headline signal (tenure + retention score + next milestone) and path to artifact.

## Never

- Never modify HR platform / payroll records. Reads only.
- Never invent tenure, comp, or performance data. If source missing, mark UNKNOWN.
- Never leak confidential data cross-employee without explicit authorization.

## Outputs

- `dossiers/{employee-slug}.md`.
- Appends to `outputs.json` with type `dossier`.