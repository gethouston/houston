---
name: write-an-article
description: "Turn a resolved ticket into a help-center article, draft a known-issue status page when something breaks, send personalized 'you asked, we shipped' notes to the customers who requested a feature, or flag stale articles that need a refresh after a product change. Pick the flavor and get a publish-ready draft grounded in real conversations and your voice."
version: 1
category: Support
featured: no
image: headphone
integrations: [googledocs, notion, github, linear]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Write an Article

One skill, every help-center writing ask. Branch on `type`.

## When to use

- **from-ticket**  -  "turn this ticket into article" / "document this
  resolution" / "answered same question 3x  -  write up." Called
  implicitly from `flag-a-signal signal=repeat-question` when cluster
  hits ≥3, no matching article.
- **known-issue**  -  "draft known-issue doc for {bug}" / "P1, put up
  status page" / chained from `draft-a-playbook`.
- **broadcast-shipped**  -  "shipped X  -  tell customers who asked" /
  "send 'you asked, we shipped' note."
- **refresh-stale**  -  "refresh articles affected by this ship" /
  "audit docs  -  pricing changed" / monthly help-center routine.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Knowledge base** (Notion / Google Docs / Help Scout / Intercom)  -  mirror the draft to your published KB. Required for `from-ticket` and `refresh-stale` if you want me to push the draft there.
- **Dev tracker** (GitHub / Linear)  -  pull bug context for the `known-issue` doc. Required for `known-issue`.
- **Inbox** (Gmail)  -  source the resolved thread when it's not already in `conversations.json`. Optional.

If you ask for a known-issue page and your tracker isn't connected I stop and ask you to connect it.

## Information I need

I read your support context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Help-center platform**  -  Required. Why I need it: format and tone vary by destination. If missing I ask: "Where do your help articles live today  -  Notion, Intercom, a docs site, or nowhere yet?"
- **Voice samples**  -  Required. Why I need it: KB articles in the wrong voice get rewritten. If missing I ask: "Want me to mine your sent folder for tone, or can you drop 3 to 5 of your recent customer emails?"
- **KB tone profile**  -  Optional. Why I need it: some teams want KB more formal than chat replies. If you don't have it I keep going with TBD and match your reply voice.
- **What shipped**  -  Required for `broadcast-shipped`. Why I need it: I won't broadcast a vague "we shipped stuff." If missing I ask: "What did you ship  -  give me a title and one sentence on what's new?"
- **What changed**  -  Required for `refresh-stale`. Why I need it: I scan articles for refs to the changed thing. If missing I ask: "What changed  -  pricing, a feature name, a UI flow, something else?"

## Parameter: `type`

- `from-ticket`  -  article grounded in resolved conversation. Pull
  thread, extract reusable answer, write to `articles/{slug}.md`.
  Mirror to connected KB platform if linked.
- `known-issue`  -  customer-facing status entry. Write to
  `known-issues/{slug}.md` + append to `known-issues.json` with
  `{id, title, affectedProduct, currentStatus, postedAt, updatedAt}`.
- `broadcast-shipped`  -  personalized "you asked, we shipped"
  drafts, one per customer in `requests.json` who asked for thing
  just shipped. Write to `broadcasts/{YYYY-MM-DD}-{slug}.md`.
- `refresh-stale`  -  scan `articles/` for refs now wrong (pricing,
  UI, feature name), flag `needsReview: true` in `outputs.json`,
  draft update.

## Steps
<!-- houston-workflow:v1 -->

1. **Read `context/support-context.md`.** Missing? Stop.
2. **Read ledger.** Fill gaps.
3. **Branch on `type`:**
   - `from-ticket`: ask which `{conversation id}` to source, or
     pick auto from cluster surfaced by `flag-a-signal
     signal=repeat-question`. Read
     `conversations/{id}/thread.json`. Extract question, answer,
     screenshots, code refs. Draft in tone from
     `domains.help-center.toneProfile`.
   - `known-issue`: ask bug id + title if not given. Read
     `bug-candidates.json` for details. Draft status doc: what's
     broken, who affected, workaround, current status, ETA (only
     if pre-approved). Append to `known-issues.json`.
   - `broadcast-shipped`: ask what shipped (title + 1-sentence
     blurb). Read `requests.json`, filter to customers who asked
     for exactly this. Draft short personal note per customer,
     ref specific ask. Never bulk-send  -  one file per customer in
     `broadcasts/`.
   - `refresh-stale`: ask what changed (pricing / UI / feature
     name). Scan every `articles/{slug}.md` via grep for refs to
     changed element. Each hit: write proposed rewrite diff, don't
     overwrite. Mark `needsReview: true` in `outputs.json`.
4. **Write artifact** atomically.
5. **Append to `outputs.json`** with `type` =
   `kb-article` | `known-issue` | `broadcast` | `article-refresh`,
   `domain: "help-center"`, title, summary, path, status `draft`.
6. **Summarize**: headline + what to review + where to publish.

## Outputs

- `articles/{slug}.md` (for `type = from-ticket`, `refresh-stale`)
- `known-issues/{slug}.md` + `known-issues.json` entry (for
  `type = known-issue`)
- `broadcasts/{YYYY-MM-DD}-{slug}.md` (for `type = broadcast-shipped`)
- Append to `outputs.json` with `domain: "help-center"`.

## What I never do

- Publish direct to connected KB. I draft; you publish.
- Invent ETA for `known-issue`  -  engineering not committed? Write
  "investigating."
- Generic template for `broadcast-shipped`  -  every note cite
  specific request.
