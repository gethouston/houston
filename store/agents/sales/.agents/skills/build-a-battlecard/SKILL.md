---
name: build-a-battlecard
description: "Build a battlecard for one specific deal versus one specific competitor - not a generic comparison sheet. Three-criterion grid anchored in what this prospect cares about, three trap-set discovery questions, three objection rebuttals grounded in your real differentiators, and two proof points from anchor accounts. Every claim cites a source."
version: 1
category: Sales
featured: no
image: handshake
integrations: [notion, reddit, firecrawl]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Build A Battlecard

NOT generic comparison sheet. Per-prospect card anchored in what THAT prospect cares about.

## When to use

- User: "they're evaluating us against {competitor}" / "build me battlecard for Acme deal vs {competitor}" / "how do I beat {competitor} for this one".
- Called inline by `write-my-outreach` or `check-my-sales subject=discovery-call` when competitor named in transcript.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Scrape**  -  read the competitor's marketing page, pricing, and recent reviews. Required.
- **Search / research**  -  pull recent reviews, forum threads, and known weaknesses. Required.
- **CRM**  -  read the prospect's deal context to anchor the card. Optional.

If none of the required categories are connected I stop and ask you to connect Firecrawl first since the card depends on a fresh competitor read.

## Information I need

I read your sales context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your sales playbook**  -  Required. Why I need it: I lift differentiators, anchor accounts, and proof points from it. If missing I ask: "I don't have your playbook yet  -  want me to draft it now?"
- **Prospect name and competitor name**  -  Required. Why I need it: card is anchored to one specific deal versus one specific competitor, not a generic sheet. If missing I ask: "Which prospect deal is this for, and which competitor are they comparing us to?"
- **Your top differentiator and biggest weakness vs this competitor**  -  Required. Why I need it: card is honest only if I know how you actually win and lose. If missing I ask: "What's your honest top differentiator vs this competitor, and your biggest weakness?"
- **Anchor customer wins matching the prospect**  -  Optional. Why I need it: proof points land harder when they match the prospect's profile. If you don't have it I keep going with TBD.

## Workflow
<!-- houston-workflow:v1 -->

1. **Identify prospect + competitor.** Load lead row in `leads.json` and `calls/{slug}/notes-*.md` if call exists  -  prospect's specific evaluation criteria and stated pains = anchor.
2. **Read our product + positioning.** `context/sales-context.md` for what we claim  -  especially "Top 3 competitors" and "Category & differentiators" sections. If thin, ask once: "What's your honest top-3 differentiator vs {competitor}? And biggest weakness? (Roll into playbook  -  paste, or point at Notion / Google Doc URL.)"
3. **Research competitor.** Run `composio search` for available research tools. Pull:
   - Marketing-page positioning (one-line pitch, top 3 claims)
   - Public pricing shape (tiers, model)
   - Recent reviews last 6 months (G2 / Capterra / Reddit / forum threads  -  via any connected web-search tool)
   - Known weaknesses (complaints about {X}, performance gripes, missing features)
   Capture sources + dates.
4. **Research prospect's use case.** From dossier and call notes, summarize in 2 lines: what they need tool to do, and top 3 criteria.
5. **Build comparison grid**  -  for THEIR top 3 criteria only (not 30-row feature matrix). Each: us vs them, honest verdict (WE-WIN / THEY-WIN / TIE), one-sentence why.
6. **Trap-set questions.** 3 questions user asks next call to surface competitor weaknesses naturally  -  not gotchas, genuine discovery. Each tied to known competitor pain.
7. **Objection rebuttals.** Anticipate 3 objections competitor's rep raises about us; draft 2-sentence rebuttal each, anchored in our differentiators (no false claims).
8. **Proof points to cite.** 2-3 customer stories from playbook's anchor accounts section matching prospect profile. If anchor accounts thin, ask once for Notion / Google Doc URL listing top-cited wins; fold into playbook on next `set-up-my-sales-info` run.
9. **Write** to `battlecards/{competitor-slug}-{prospect-slug}.md` with: prospect + competitor header, criteria grid, trap-set questions, objection rebuttals, proof points, research-sources footer.
10. **Append to `outputs.json`**  -  read-merge-write atomically: `{ id (uuid v4), type: "battlecard", title: "{Prospect} vs {Competitor}", summary, path, status: "draft", createdAt, updatedAt, domain: "meetings" }`.
11. **Hand off to user:** "Battlecard ready  -  3-criterion grid, 3 trap-set questions, 3 rebuttals, 2 proof points. Want me to weave into follow-up draft with `write-my-outreach stage=followup`?"

## Honesty rule

Never fabricate "they're weak at {X}" without cited source. If claim has no source, mark "(hypothesis  -  verify)" so user doesn't repeat as fact. Fabricated battlecards blow up in demos.

## Outputs

- `battlecards/{competitor-slug}-{prospect-slug}.md`
- Appends to `outputs.json` with `type: "battlecard"`, `domain: "meetings"`.