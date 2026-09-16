---
name: draft-a-playbook
description: "Write a step-by-step incident response playbook so the next time something breaks, you already know who to page, what to tell customers, and when to post updates. Covers detection through post-mortem, with real names, real channels, and comms templates in your voice. One doc you write once and run every time."
version: 1
category: Support
featured: no
image: headphone
integrations: [github, linear, slack, microsoftteams]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Draft a Playbook

## When to use

- "draft the P1 playbook" / "runbook for outages" / "security incident playbook."
- After incident where you say "we need real playbook for this."
- When onboarding marks incident response `TBD`.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Messaging** (Slack / Microsoft Teams)  -  named internal channel for the "first 15 minutes" page step. Required.
- **Dev tracker** (GitHub / Linear)  -  named target for engineering handoff and post-mortem tracking. Required.

If neither is connected I stop and ask you to connect Slack (or Teams) first  -  the playbook depends on a real internal channel.

## Information I need

I read your support context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Severity definition for this incident type**  -  Required. Why I need it: the trigger line at the top of the playbook needs a real boundary. If missing I ask: "What counts as a P1 for you  -  give me 2 or 3 example tickets that would qualify?"
- **On-call rotation + named contacts**  -  Required. Why I need it: the playbook pages real humans, not "engineering." If missing I ask: "Who's the engineering on-call when something breaks at 2am, and how do you reach them?"
- **VIP list**  -  Required. Why I need it: VIPs get a 1:1 message during incidents, not a bulk email. If missing I ask: "Which 3 to 5 customers should always get a personal note from you when there's an incident?"
- **Status page / public comms channel**  -  Optional. Why I need it: the "first 15 minutes" step flips it to investigating. If you don't have it I keep going with TBD.
- **Customer comms voice**  -  Optional. Why I need it: incident templates read truer in your tone. If you don't have it I keep going with TBD and recommend running voice calibration.

## Steps
<!-- houston-workflow:v1 -->

1. **Read `context/support-context.md`.** Pull current response-time tiers, VIP list, escalation contacts. Missing? Run `set-up-my-support-info` first.

2. **Ask two targeted questions**  -  no more:
   - **What counts as {type} for this product?** (P1 definition, outage = what, security incident = what). Give 2–3 example ticket phrasings.
   - **Who needs loop in?** Engineering on-call, named VIPs, legal/compliance contact, status page operator, insurance (for data incidents).

3. **Synthesize runbook**  -  markdown, ~300–500 words, structured by timeline:

   ```markdown
   # {Playbook Title}

   **Trigger:** {what qualifies}
   **Severity:** P{N}
   **Primary owner:** {role}

   ## First 15 minutes  -  Detect & contain

   1. Acknowledge in {internal-channel}  -  paste the customer's
      wording verbatim.
   2. Page {on-call contact} via Composio.
   3. Confirm scope  -  how many customers, which surface.
   4. Status page: flip to "Investigating" with 1-liner
      acknowledgement.

   ## First 60 minutes  -  Customer comms

   1. Send the "we know, we're on it" template to affected
      customers (template below).
   2. VIPs (see `context/support-context.md#segments`) get a 1:1 Slack/DM
      from you, not a bulk email.
   3. Update status page at the 30-min mark with progress.

   ### Customer comms template  -  "we know, we're on it"

   > Subject: {Issue}  -  we're on it
   > Hey {name},
   > {one-line description of what's broken}. We detected it at
   > {time} and are actively investigating. I'll update you again
   > within {window}. You don't need to do anything on your end.

   ## Same day  -  Root cause outline

   1. Engineering posts a 5-bullet root-cause write-up in {internal-channel}.
   2. Support drafts the customer-facing root-cause write-up (see template below).
   3. VIPs get a direct note with the root-cause write-up before it goes public.

   ### Customer-facing root-cause write-up template

   > Subject: {Issue}  -  what happened and what we're doing
   > {Two paragraphs: what broke, what we did, what's changing so
   > it doesn't happen again. Plain, no jargon.}

   ## Follow-up within 48 hours  -  Post-mortem

   1. Internal post-mortem doc (blameless). Owner: {engineering
      lead}.
   2. Known-issue article shipped via `write-an-article type=known-issue`.
   3. Any customer who experienced it gets a personal follow-up.

   ## What we never do

   - Blame a specific person in customer comms.
   - Promise a remediation date we can't keep.
   - Let the status page go quiet for > 30 min during an open
     incident.
   ```

4. **Template filled sections**  -  use actual VIP names, internal-channel name, tracker tool (from `context/support-context.md`). Pre-fill customer comms templates with their voice (from `context/support-context.md#voice`).

5. **Write to `playbooks/{slug}.md`** atomically (`.tmp` → rename). Slug = kebab-case (e.g. `p1-outage.md`, `security-incident.md`, `data-loss.md`).

6. **Append to `outputs.json`** with `type: "escalation-playbook"`, `domain: "quality"`, title = playbook name, summary = 2 sentences on trigger + primary owner, path `playbooks/{slug}.md`, status `draft`.

7. **Summarize to me.** One paragraph: what's in playbook, what sections still need judgement ("name engineering on-call contact," "pick internal channel"), reminder: "Edit once. Every incident after this just runs through same doc."

## Outputs

- `playbooks/{slug}.md`
- Appends to `outputs.json` with `type: "escalation-playbook"`, `domain: "quality"`.
