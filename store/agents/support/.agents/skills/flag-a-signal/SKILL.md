---
name: flag-a-signal
description: "Spot something in a ticket that's bigger than the ticket itself and I file it properly. A bug report gets logged with repro steps and severity so engineering can act on it. A feature request gets attributed to the customer who asked. And if I see the same question come up three or more times without a help article, I flag the docs gap and offer to write one."
version: 1
category: Support
featured: no
image: headphone
integrations: [gmail, github, linear, jira]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Flag a Signal

One skill for every "thread contain signal to file" ask. Branch on `signal`.

## When to use

- **bug**  -  "is this bug? log it" / message contain error messages, stack traces, "used to work, now doesn't," repro steps, or screenshots of broken UI.
- **feature-request**  -  conversation or DM contain feature ask ("can you add X?", "would be great if Y").
- **repeat-question**  -  on weekly cron, or when scan last 30–60 days and cluster of semantically similar incoming questions hit ≥3 with no matching article.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Dev tracker** (GitHub / Linear / Jira)  -  draft an issue for confirmed bug candidates. Required for `bug` if you want me to chain into your tracker.
- **Inbox** (Gmail)  -  source threads for clustering repeat questions. Optional if `conversations.json` already covers the window.

If you want me to file bug candidates in a tracker I stop and ask you to connect the one you actually use.

## Information I need

I read your support context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Product surface**  -  Required. Why I need it: tells me what's in-scope (real bug) vs out-of-scope (third-party). If missing I ask: "What does your product actually cover  -  share a quick overview or point me at your homepage?"
- **Bug vs feature classification rules**  -  Required. Why I need it: the line between "broken" and "missing" determines where the signal goes. If missing I ask: "When a customer reports something doesn't work, what makes it a bug for you versus a feature request?"
- **Help-center platform**  -  Required for `repeat-question`. Why I need it: I check existing KB coverage before flagging a cluster as a docs gap. If missing I ask: "Where do your help articles live today  -  Notion, Intercom, a docs site, or nowhere yet?"

## Parameter: `signal`

- `bug`  -  extract repro steps, affected version, affected customer. Assign severity per `context/support-context.md#severity`. Append to `bug-candidates.json`. Offer chain to connected tracker (GitHub / Linear / Jira via Composio).
- `feature-request`  -  extract ask + requesting-customer slug. Append / merge in `requests.json`. If merging, increment requester count; if VIP, flag.
- `repeat-question`  -  scan last 30–60 days of `conversations.json`. Cluster semantically similar incoming questions. For each cluster ≥3 without matching article, append to `patterns.json` and surface as docs gap.

## Steps
<!-- houston-workflow:v1 -->

1. **Read `context/support-context.md`.** If missing, stop.
2. **Read ledger.** Fill gaps.
3. **Branch on `signal`:**
   - `bug`: read source `conversations/{id}/thread.json`. Extract repro (numbered steps), affected version, error message / stack trace. Assign severity. Write new entry to `bug-candidates.json` (read-merge-write) with `{id, title, severity, affectedCustomers, reproSteps, sourceConversationId, status: "new"}`. If told, chain to connected tracker by calling its create-issue tool.
   - `feature-request`: read source message. Extract ask in single sentence. Look for near-duplicates in `requests.json`; if found, append customer slug and increment. If new, create entry. Never attribute request to customer who didn't make it.
   - `repeat-question`: read `conversations.json` last 30–60 days. Cluster by topic / first-line similarity. For each cluster ≥3, check `articles/` for existing answer. If none, append new pattern to `patterns.json` with `{cluster, exampleIds, count, suggestedTitle}`. Offer chain `write-an-article type=from-ticket` for top pick.
4. **Append to `outputs.json`** with `type` = `bug-candidate` | `feature-request` | `repeat-question`, `domain: "inbox"` (bug / feature-request) or `domain: "help-center"` (repeat-question), title, summary, path.
5. **Summarize to me**: what filed + where + recommended next chain.

## Outputs

- `bug-candidates.json` entry (for `signal = bug`)
- `requests.json` entry (for `signal = feature-request`)
- `patterns.json` entry (for `signal = repeat-question`)
- Appends to `outputs.json`.

## What I never do

- File bug in connected tracker without your approval. Draft issue; you create.
- Attribute feature request to customer who didn't ask.
- Flag repeat-question cluster that already has article  -  check `articles/` first.
