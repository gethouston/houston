---
name: check-my-sales
description: "Get a read on how your sales motion is actually doing. Pick what you need: a Monday rollup across every domain, a cross-call synthesis with playbook edits, a win-loss pattern read, a deep read on a single discovery call, or a pipeline snapshot with the leakiest stage. Every read ends with a concrete next move, not a dashboard."
version: 1
category: Sales
featured: yes
image: handshake
integrations: [hubspot, salesforce, attio, gong, fireflies]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Check My Sales

One skill, five analysis surfaces. `subject` param picks scope. "Next moves over dashboards" discipline shared.

## Parameter: `subject`

- `sales-health`  -  Monday readout. Aggregate every skill output across last week from `outputs.json`. Group by domain (Playbook, Outbound, Inbound, Meetings, CRM, Retention). Flag stalled work + missed followups + slippage.
- `call-insights`  -  cross-N-call synthesis: pain language, objection frequency, win/loss patterns  -  with concrete playbook-edit suggestions.
- `win-loss`  -  cluster closed-won + closed-lost deals by reason. Find 3 repeating patterns. Propose playbook edits (ideal-customer tightening, objection handbook additions, pricing adjustments).
- `discovery-call`  -  single-call deep read: talk-ratio (target 40% rep / 60% prospect), pain score, qual gaps vs playbook framework, risks / opportunities, draft followup.
- `pipeline`  -  snapshot by stage + annual revenue + deal velocity + leakiest transition. Anchors weekly forecast.

User ask names subject plain English ("sales review", "mine calls", "win-loss", "how did that call go", "pipeline check") → infer. Else ask ONE question naming 5 options.

## When to use

- Explicit triggers in description.
- Implicit: `capture-my-call-notes` chains into `check-my-sales subject=discovery-call` to complete post-call loop. Weekly routine "Monday sales review" fires `subject=sales-health`. `run-my-forecast` chains into `subject=pipeline` for narrative layer.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Meetings**  -  pull call transcripts for `discovery-call` and `call-insights`. Required for those subjects.
- **CRM**  -  pull closed-won/lost deals for `win-loss` and open-deal snapshot for `pipeline`. Required for those subjects.

If none of the required categories are connected I stop and ask you to connect your call recorder first (Gong or Fireflies) since most asks land on call-driven subjects.

## Information I need

I read your sales context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your sales playbook**  -  Required. Why I need it: qualification framework, deal stages, and objection handbook ground every read. If missing I ask: "I don't have your playbook yet  -  want me to draft it now? Takes about 5 minutes."
- **Connected call recorder**  -  Required for `discovery-call` and `call-insights`. Why I need it: I read the transcript to score talk-ratio and surface pain language. If missing I ask: "Connect Gong or Fireflies, or paste the transcript here."
- **Connected CRM**  -  Required for `win-loss` and `pipeline`. Why I need it: I pull closed deals and stage snapshots. If missing I ask: "Connect your CRM (HubSpot, Salesforce, Attio, Pipedrive, or Close), or paste a recent stage list."

## Steps
<!-- houston-workflow:v1 -->

1. **Read ledger + playbook.** Gather missing required fields (ONE question each, best-modality first). Write atomically.

2. **Branch on subject.**
   - `sales-health`: read `outputs.json` last 7 days (or user-specified window). Group by domain. Per domain, surface (a) what shipped (titles + paths), (b) what stale (items `status: draft` > 7 days + no `updatedAt` in 3+ weeks), (c) single most useful next move. End **top 3 moves for the week** across domains.
   - `call-insights`: read `calls/*/notes-*.md` + `analysis-*.md` from last N calls (default 10, user override). Extract: top 5 pain phrases (verbatim, frequency-counted), top 5 objections (frequency-counted + current best reframe), win/loss themes (what landed vs stalled). End concrete playbook-edit suggestions: "add pain X to ideal customer profile", "rework objection Y handbook entry", "tighten qualification pillar Z". Save to `call-insights/{YYYY-MM-DD}.md`.
   - `win-loss`: pull closed-won + closed-lost deals from CRM (≥5 each recommended; warn if fewer). Cluster by reason. Find 3 patterns. Propose playbook edits. Save to `analyses/win-loss-{YYYY-MM-DD}.md`.
   - `discovery-call`: read latest `calls/{slug}/notes-*.md` (or ask for call id). Compute talk-ratio from transcript if available (speaker labels), else estimate from note density. Score each qualification pillar 0-3 vs playbook framework. Surface risks (unanswered objections, missing stakeholder, stalled pillar) + opportunities (expansion signal, strong champion, timeline pressure). End with drafted followup (hand off to `write-my-outreach stage=followup` or draft inline). Save to `calls/{slug}/analysis-{YYYY-MM-DD}.md`.
   - `pipeline`: pull open-deal snapshot from CRM. Per stage: count, annual revenue, average time-in-stage, stage-to-next-stage conversion. Flag leakiest transition. Compare against last week snapshot if `pipeline-reports/*.md` exists. Save to `analyses/pipeline-{YYYY-MM-DD}.md` + mirror raw table into `pipeline-reports/{YYYY-WNN}.md`.

3. **Write atomically.** Each subject writes to path above with `*.tmp` → rename.

4. **Append to `outputs.json`**  -  read-merge-write atomically: `{ id (uuid v4), type: "analysis" (or "call-analysis" for discovery-call, "pipeline-report" for pipeline), title: "{Subject}  -  {date}", summary: "<top finding + top move>", path, status: "ready", createdAt, updatedAt, domain: "<playbook (sales-health, win-loss, call-insights) | meetings (discovery-call) | crm (pipeline)>" }`.

5. **Summarize to user.** One paragraph: single most important finding + top next move. Path to full artifact.

## What I never do

- Invent pipeline numbers, win/loss reasons, call-insight patterns. Every finding ties to real row or transcript passage.
- Ship generic readout  -  every analysis ends with concrete next move tied to existing skill.
- Roll up across time windows too short to be meaningful (`win-loss` with <3 either side; `call-insights` with <5 calls)  -  surface warning instead.

## Outputs

- `sales-health`, `win-loss`, `pipeline` → `analyses/{subject}-{date}.md`
- `call-insights` → `call-insights/{YYYY-MM-DD}.md`
- `discovery-call` → `calls/{slug}/analysis-{YYYY-MM-DD}.md`
- `pipeline` also mirrors table to `pipeline-reports/{YYYY-WNN}.md`
- Appends to `outputs.json`.