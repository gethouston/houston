---
name: find-my-bottlenecks
description: "Find what's actually slowing your company down so you can unblock it. I cluster evidence from your recent reviews, pending decisions, open anomalies, and off-track goals into named bottlenecks, each with a hypothesis and a proposed owner to unblock it. Use this when something feels stuck and you can't put your finger on why."
version: 1
category: Operations
featured: no
image: clipboard
x_houston:
  created_by: houston
  skill_schema: 1
---


# Find My Bottlenecks

## When to use

- User asks "what's stuck," "what's blocking progress," "why aren't we moving on X."
- Most recent weekly review (from this agent) repeats risk or ask from prior one.
- Goal flipped to off-track and linked initiative also slipped.

## Connections I need

I run external work through Composio. Before this skill runs I check the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Project tracker** (Linear, Notion, Asana)  -  Optional. Surfaces stalled initiatives and ticket-level blockers; I work without it but with less signal.
- **Team chat** (Slack)  -  Optional. Lets me catch repeating asks across threads.

This skill works without any connection  -  it leans mostly on what's already in your saved work. I never block here.

## Information I need

I read your operations context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Active priorities**  -  Required. Why I need it: a bottleneck only matters if it blocks something you're pushing on. If missing I ask: "What are the 2 to 3 things the company is pushing on this quarter?"
- **Key contacts**  -  Required. Why I need it: I propose owners to unblock; without contacts I'd be guessing names. If missing I ask: "Who unblocks what  -  engineering, sales, ops? Names plus how to reach them."
- **Recent decisions, reviews, or goal snapshots**  -  Optional. Why I need it: more saved work means stronger evidence. If you don't have it I keep going with TBD and lean on what's there.

## Steps
<!-- houston-workflow:v1 -->

1. **Read `context/operations-context.md`.** If missing or empty, stop and ask user run `set-up-my-ops-info` first. Priorities and key-contacts anchor "proposed owner to unblock" logic.

2. **Gather evidence from last 4 weeks** (handle each source as "if present, use it; if missing, continue"):
   - `reviews/`  -  last 4 weekly review files. Look for repeating risks / asks.
   - `triage/`  -  last 4 inbox-triage files. Recurring "can-wait" threads from same person hint at delegation bottleneck.
   - `decisions.json`  -  any decision with `status: "pending"` older than 14 days → decision-latency bottleneck.
   - `goal-history.json`  -  any goal metric `off-track` across two or more consecutive snapshots → bottleneck candidate tied to linked initiative.
   - this agent `anomalies.json`  -  repeating open anomalies hint at data-or-process bottleneck.

3. **Cluster recurring themes.** Group evidence by shared owner, shared cross-team dependency, or shared goal. Bottleneck = cluster, not individual incident.

4. **For each cluster, form hypothesis** (1-2 sentences, never stated as certain):
   - "Hiring in engineering bottlenecked on founder's interview calendar  -  3 initiatives waiting on same reviewer."
   - "Pricing changes blocked on pending decision from week of {date}  -  2 launches staged behind it."
   - "Cross-agent data pulls duplicating work  -  both board pack and investor update asking for same retention query."

5. **Propose owner to unblock.** Read leadership / key contacts section of operating context. For cross-team bottlenecks, owner = whoever owns blocking resource (e.g. CTO for engineering-calendar constraint), not downstream exec. For solo founder, owner = founder  -  proposed unblock usually "carve time for {X}" or "delegate {Y}".

6. **Quantify impact.** List `impactOnGoalIds` (objectives blocked) and `impactOnInitiativeSlugs` (initiatives stalled). Keep citations tight  -  evidence strings reference real paths (review files, decision slugs, anomaly ids).

7. **Dedupe against open bottlenecks.** Read `bottlenecks.json`. If cluster matches existing open row (same proposed owner + overlapping impact set), update in place (add new evidence, refine hypothesis, refresh `updatedAt`). Do NOT create duplicate.

8. **Sensitive-matter routing.** If hypothesis names specific person as bottleneck (performance / capacity), do NOT land that language in `bottlenecks.json`. Generalize to role-and-process language ("engineering interview capacity") in index row. Flag specifics to CEO in chat only.

9. **Write new / updated bottlenecks** to `bottlenecks.json` (atomic). Each row: `{ slug, title, hypothesis, proposedOwner, impactOnGoalIds, impactOnInitiativeSlugs, status: "open", evidence, createdAt, updatedAt }`.

10. **Append to `outputs.json`** with `type: "bottleneck"`, status "ready" per new row.

11. **Hand off in chat.**

    ```
    {N} bottleneck(s) identified.

    1. **{title}**  -  proposed owner: {owner}.
       Hypothesis: {hypothesis}
       Blocks: {N} goal(s), {M} initiative(s).
       Evidence: {citations}

    2. ...

    Want me to draft a nudge to {proposed owner} for #1?
    (I'd hand that off to the `draft-a-message` skill.)
    ```

## Outputs

- Appended / updated `bottlenecks.json`
- Appends to `outputs.json` with `type: "bottleneck"` per new row.

## What I never do

- **Name person as bottleneck** in indexed JSON  -  generalize to role/process, flag specifics privately.
- **State hypothesis as certain**  -  "likely" / "pattern suggests" only.
- **Draft nudge message here**  -  hands off to `draft-a-message` (inbox voice-matched drafts).