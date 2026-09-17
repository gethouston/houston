---
name: set-up-my-people-info
description: "Tell me how you do HR  -  values, leveling (IC and manager, L1-L5), comp bands, review-cycle rhythm, policy canon, escalation rules, voice, and hard nos  -  so I can give you sharp drafts and answers. This is the foundation doc every other people Action reads first."
version: 1
category: People
featured: yes
image: busts-in-silhouette
integrations: [googlesheets, googledocs, notion]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Set Up My People Info

One doc every skill in agent reads before producing substantive output  -
offer, performance improvement plan (PIP), policy answer, retention score, review cycle. Owned at
`context/people-context.md`. I draft, you decide. Never set comp bands or
lock leveling without sign-off.

## When to use

- "draft our people-context doc" / "set up our people context" /
  "document how we do HR".
- "update the people-context doc" / "our leveling changed, fix the
  context doc".
- "draft our leveling framework" / "build the leveling ladder" /
  "what's an L3 vs L4".
- Called implicitly by any skill needing doc when missing  -  only after
  confirming with you.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **HR platform (Gusto, Deel, Rippling, Justworks)** — pull team shape directly. Optional.
- **Docs (Notion, Google Docs)** — import an existing handbook or policy doc. Optional.
- **Sheets (Google Sheets)** — import comp bands or roster pastes. Optional.

No integration is strictly required — I draft from your answers if nothing is connected.

## Information I need

I read your people context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Company and stage** — Required. Why I need it: pre-first-hire gets more scaffolding, 15+ gets tighter. If missing I ask: "What's the company name, what does it do in one line, and how many people are on the team today?"
- **Values** — Required. Why I need it: every level definition ties back to values. If missing I ask: "What are the four to six things you want this team to stand for, in your own words?"
- **Leveling intent** — Required. Why I need it: I don't pick a leveling ladder for you. If missing I ask: "Do you want a single IC ladder, IC plus manager tracks, or are you not ready to define levels yet?"
- **Comp stance** — Optional. Why I need it: bands shape comp-letter and offer drafts. If you don't have it I keep going with TBD on comp bands.
- **Escalation routing** — Required. Why I need it: discrimination, harassment, wage, and visa questions need a named human. If missing I ask: "Who do those issues route to. Is there a named employment lawyer, or should we mark it TBD until you've retained one?"
- **Existing handbook** — Optional. Why I need it: I import policies instead of inventing them. If you don't have it I keep going with TBD on policy canon.
- **Hard nos** — Optional. Why I need it: shapes counter-offer rules and other downstream drafts. If you don't have it I keep going with TBD.

## Steps
<!-- houston-workflow:v1 -->

1. **Read `config/context-ledger.json`.** Fill gaps with single targeted
   question.
2. **Read existing doc if present.** If `context/people-context.md`
   exists, read so run = update, not rewrite. Preserve sharpened parts;
   change only stale or new.
3. **Optional import.** Ask once: "Got an existing handbook, policy
   doc, or comp sheet I should pull from? I can read Notion, Google
   Docs, or Google Sheets if you've connected one." If yes, run
   `composio search docs` / `composio search sheets`, fetch, cite
   source per section.
4. **Push hard on escalation rules  -  cannot be inferred.** Ask
   directly: "Who do discrimination / harassment / wage-dispute /
   visa issues route to? A named human lawyer, or should we mark
   TBD?" No defaults. No lawyer yet → section reads `TBD  -  needs
   employment lawyer on retainer before first hire` and I tell you
   explicitly.
5. **Draft doc (~500-900 words, opinionated).** Sections, in order:
   1. **Company values**  -  4-6 values, 1-line definitions. From your
      words; no HR-poster clichés.
   2. **Team shape**  -  headcount by function, open reqs. Pull from
      connected HR platform if available, else paste.
   3. **Leveling framework**  -  IC + manager tracks with level names,
      summary expectations, scope of impact, seniority markers per
      level. Default L1-L5; ask once if you want higher. Each level
      has: name (e.g. "Senior Engineer"), one-paragraph expectations,
      scope (team / function / org / cross-org), seniority markers
      (rough years band, decision rights, ambiguity tolerance), and
      "Embodies {value X, value Y} at this level by…" line tying to
      values section.
   4. **Comp bands**  -  range per level, equity stance, location
      multipliers. Accept `TBD` generously  -  week 0 founders don't
      know bands yet.
   5. **Review-cycle rhythm**  -  annual / semi-annual / quarterly,
      next cycle date.
   6. **Policy canon**  -  leave, benefits, expenses, remote work,
      travel, equipment. Link source docs where exist; `TBD` where
      not.
   7. **Escalation rules**  -  agent-answered vs founder-routed vs
      lawyer-routed. Name lawyer / firm or write `TBD  -  needs
      employment lawyer on retainer`. Load-bearing for
      `answer-a-policy-question` and `draft-a-people-document`.
   8. **Voice notes**  -  4-6 bullets on tone, greeting patterns,
      forbidden phrases, sentence-length preference. From ledger
      voice summary + `config/voice.md` if exists.
   9. **Hard nos**  -  what team never does (e.g. "we never
      counter-offer on resignations," "we never publish salaries,"
      "we always give 30-day notice before equity expirations").
6. **Mark gaps honestly.** Thin section → write `TBD  -  {what you
   should bring next}`. Never invent. Especially never invent comp
   bands, escalation routing, legal language.
7. **Write atomically** to `context/people-context.md.tmp`, then
   rename. One file at `context/`. NOT under `.agents/`. NOT under
   `.houston/<agent>/`.
8. **Update ledger.** Set
   `universal.positioning = { present: true, path:
   "context/people-context.md", lastUpdatedAt: <ISO> }` atomically.
9. **Append to `outputs.json`.** Entry:
   ```json
   {
     "id": "<uuid v4>",
     "type": "people-context",
     "title": "People-context doc updated",
     "summary": "<2-3 sentences  -  what changed this pass + which sections still TBD>",
     "path": "context/people-context.md",
     "status": "draft",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>",
     "domain": "culture"
   }
   ```
   (Doc = live file; each substantive edit indexed so update trail
   shows on dashboard.)
10. **Summarize.** One paragraph: what changed, which sections still
    `TBD` (especially escalation rules + comp bands), exact next move.

## Outputs

- `context/people-context.md` (live document).
- Appends to `outputs.json` with `type: "people-context"`,
  `domain: "culture"`.

## What I never do

- Set comp bands or lock leveling definitions without sign-off.
- Draft escalation rules without explicit input  -  ask or mark `TBD`.
  Section load-bearing + legal-adjacent.
- Write doc under `.agents/` or `.houston/<agent>/`  -  Houston's
  watcher skips those paths. Always `context/`.