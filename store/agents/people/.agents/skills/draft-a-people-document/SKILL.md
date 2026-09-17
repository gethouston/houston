---
name: draft-a-people-document
description: "Draft a people document for you, like an offer letter, an onboarding plan, a performance improvement plan (PIP), or a stay conversation script. I draft against your comp bands, voice, leveling framework, and hard nos so it sounds like you wrote it. Drafts only, you ship every one."
version: 1
category: People
featured: yes
image: busts-in-silhouette
integrations: [googledocs, notion, loops, gmail, slack]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Draft a People Document

One skill for every first-draft people document the founder needs. `type` param picks template + structure + checks. "Drafts only, never sent / scheduled / delivered" discipline shared.

## Parameter: `type`

- `offer-letter`  -  offer letter for a new hire at a specific level, anchored on comp bands + equity stance.
- `onboarding-plan`  -  Day 0, Week 1, 30-60-90 plan plus welcome Slack message + welcome email in your voice.
- `pip`  -  performance improvement plan. Mandatory escalation check first. If a protected-class + pretextual-timing trigger fires, STOP and write an escalation note instead.
- `stay-conversation`  -  verbal 1:1 SCRIPT, not email. Five sections: Open → Listen → Surface → Ask → Propose. Filtered against hard nos.

User names type in plain English ("draft an offer for {candidate}", "plan {new hire}'s onboarding", "draft a PIP for {employee}", "script the stay conversation") → infer. Ambiguous → ask ONE question naming the four options.

## When to use

- `type=offer-letter`  -  "draft an offer for {candidate}", "write the offer letter", "offer letter for {candidate} at {level}". Prereq: candidate record + debrief exist, founder decided to proceed.
- `type=onboarding-plan`  -  "draft the onboarding plan for {new hire}", "first 90 days for {new hire}", "{new hire} starts {date}  -  get them ready", "first-morning checklist for {new hire}", "Day-0 welcome Slack for {new hire}". Implicit: routed after `draft-a-people-document type=offer-letter` → offer accepted.
- `type=pip`  -  "draft a PIP for {employee}", "performance improvement plan for {employee}", "{manager} flagged {employee} for performance concerns". Always triggered by you  -  never implicitly.
- `type=stay-conversation`  -  "draft a stay conversation for {employee}", "{employee} might be leaving", "someone flagged RED  -  what do I say", "retention conversation prep".

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Docs (Google Docs, Notion)** — write the offer letter or onboarding plan where you want to ship it from. Optional. (`offer-letter`, `onboarding-plan`)
- **Inbox (Gmail, Outlook, Loops)** — sample your past offer / performance / hard-news voice if I haven't already. Optional, all types. Sharper voice match with one connected.
- **Chat (Slack)** — draft the welcome Slack in the right channel voice; read recent 1:1 threads if you keep notes there. Optional. (`onboarding-plan`, `pip`, `stay-conversation`)
- **HR platform (Gusto, Deel, Rippling, Justworks)** — pull start date, role, manager, location for `onboarding-plan`; confirm role / level / tenure / manager for `pip` / `stay-conversation`. Optional.

This skill never sends, schedules, or delivers, so no integration is strictly required.

## Information I need

I read your people context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

**All types:**

- **People context** — Required. Why I need it: leveling, voice, hard nos, escalation rules. If missing I tell you to run the `set-up-my-people-info` skill first.
- **Voice samples** — Optional for `offer-letter` / `onboarding-plan`, Required for `pip` / `stay-conversation`. Why I need it: tone-sensitive drafts in the wrong register land harder or softer than you mean. If missing I ask: "Connect your inbox so I can sample two or three past messages, or paste one."

**`type=offer-letter`:**

- **Candidate record and debrief** — Required. Why I need it: I draft against background and the hire decision. If missing I ask: "I don't have a debrief on file for this candidate. Have you decided to make the offer?"
- **Comp bands** — Required. Why I need it: every number traces to a band or a written override. If missing I ask: "What's the comp band for this level, base range plus equity range, and any location adjustment?"
- **Equity stance** — Required. Why I need it: vesting, cliff, and grant type can't be guessed. If missing I ask: "What's our standard equity grant, type, vesting schedule, and cliff?"
- **Offer terms** — Required. Why I need it: locks in the specific offer. If missing I ask: "Confirm the level, base, equity, start date, and location for this offer."

**`type=onboarding-plan`:**

- **New hire core details** — Required. Why I need it: every section of the plan keys off these. If missing I ask: "Tell me their name, role, level, manager, start date, and whether they're remote or in office."
- **Leveling framework** — Required. Why I need it: 30 / 60 / 90 milestones map to the bar at this level. If missing I ask: "How would you describe what 'meeting the bar' looks like at this level over the first 90 days?"
- **Welcome channel** — Optional. Default: generic team channel + TBD.
- **Buddy assignment** — Optional. Default: TBD.

**`type=pip`:**

- **Employee identity** — Required. Why I need it: I won't draft a PIP for someone I can't pin down. If missing I ask: "Which employee, full name, role, and how long they've been here?"
- **Leveling framework and hard nos** — Required. Why I need it: PIP expectations map to your bar and your hard nos. If missing I ask: "How would you describe the bar at this level, and what levers are off the table?"
- **Escalation rules** — Required. Why I need it: I run a protected-class and pretextual-timing check before any draft. If missing I ask: "Who do discrimination, harassment, and retaliation concerns route to. Is there a named lawyer, or should we mark it TBD until you have one?"
- **Recent concerns and timeline** — Required. Why I need it: timing window is load-bearing for the escalation check. If missing I ask: "When did the performance concerns first come up, and has the employee made any protected request like leave, accommodation, complaint, or pregnancy disclosure in the last 90 days?"

**`type=stay-conversation`:**

- **Employee identity** — Required. If missing I ask: "Which employee, full name, role, and how long they've been here?"

## Steps
<!-- houston-workflow:v1 -->

1. **Read people-context doc** at `context/people-context.md`. If missing/empty: "I need your people context first  -  run the set-up-my-people-info skill." Stop. Pull leveling framework, comp bands, equity stance, voice notes, hard nos, escalation rules. Load-bearing for every type.
2. **Read ledger** + fill gaps with ONE targeted question per missing required field per the type's Information section above.
3. **Read config**: `config/voice.md` for hiring/performance-voice tone (greeting/sign-off, sentence length). Missing → ask ONE targeted question naming best modality ("Connect your inbox via Composio so I can sample 2-3 past offers / hard-news messages, or paste one"). Write voice.md, continue.
4. **Branch on `type`.**

   - **If `type = offer-letter`:**
     1. **Read candidate context.** Open `interview-loops/{candidate-slug}.md` for debrief and agreed level/scope signal. Open `candidates/{candidate-slug}.md` for background. If neither exists, tell user run `debrief-an-interview-loop` first. Stop.
     2. **Confirm offer terms with founder.** ONE question if any missing: "Confirm  -  level: {X}, base: {Y}, equity: {Z}, start date: {D}, location: {L}. Override any of these? (Note: {Y} {Z} pulled from comp band {band-name} in context/people-context.md.)" If founder overrides outside band, require explicit written reason. Record in offer letter footer.
     3. **Draft offer letter.** Structure:
        - Salutation (voice-matched per `config/voice.md` + people-context voice notes).
        - Role, title, level, reporting line.
        - Base comp (from comp band).
        - Equity  -  grant size, vesting schedule, cliff, type (ISO/NSO/RSU if stated in equity stance).
        - Start date + location/remote designation.
        - Benefits pointer ("per our benefits policy canon  -  context/people-context.md").
        - Contingencies (background check, reference check, authorization to work, signed IP/PIIA).
        - Deadline to accept.
        - Sign-off (voice-matched).
     4. **Tone check.** Re-read draft against voice notes. If tone drifts (too corporate, too casual, wrong sign-off), revise before writing.
     5. **Write to `offers/{candidate-slug}.md`** atomically (`*.tmp` → rename). Header file with metadata block: `{ level, base, equity, start, location, band, overrideReason? }` plus full letter body.

   - **If `type = onboarding-plan`:**
     1. **Read HR platform context** if connected (read-only  -  agent never modifies HR records). Pull start date, role, manager, location, remote/in-office. If core hire details missing, ask ONE targeted question covering all gaps (best modality: HR platform record > pasted offer letter > paste).
     2. **Discover tools via Composio** as needed: `composio search hris`, `composio search chat`, `composio search inbox`, `composio search calendar`. If category missing, name which to link from Integrations tab and continue with rest.
     3. **Compose plan** with these sections:
        - **Day 0 prep**  -  accounts to provision (email, Slack, tooling by role), equipment to ship + tracking, buddy assignment, calendar blocks for Week 1, welcome-message queue.
        - **Week 1**  -  welcome-packet contents, intro meetings (founder, team, cross-functional), tooling walkthrough, read-me docs, first shadow tasks.
        - **Day 30 milestones**  -  deliverables + check-in prompts pulled from leveling-framework expectations for this level/track.
        - **Day 60 milestones**  -  expanded deliverables + first solo ownership.
        - **Day 90 milestones**  -  full ownership + first review anchor point.
     4. **Draft welcome Slack message + welcome email.** Read voice notes from `context/people-context.md` (and `config/voice.md` if present). Match tone fingerprint. Include buddy intro, Day-1 calendar link, one-line "here's what matters in your first week."
     5. **Write** plan atomically to `onboarding-plans/{new-hire-slug}.md` (`*.tmp` → rename). Include welcome Slack + welcome email at bottom under clearly labeled sections so founder can lift verbatim.

   - **If `type = pip`  -  run escalation check first:**
     1. Read escalation-rules section of `context/people-context.md`. Note every trigger listed. Canonical set: protected class (race, gender, age 40+, pregnancy, disability, religion, national origin, sexual orientation, veteran status  -  confirm jurisdiction's list in context doc); protected activity within trigger window (medical-leave request, pregnancy disclosure, accommodation request, whistleblower / good-faith complaint, union activity, workers' comp claim); timing trigger (concerns arising or escalating within 30-90 days of protected activity  -  window defined in doc).
     2. Assess: ask you directly (or read dossier if present) for employee's protected-class status, recent protected activity, timeline of when concerns first documented vs. when activity occurred. Do NOT guess  -  if unknown, ask + explain: "I need this to run the escalation check  -  nothing is drafted until it clears."
     3. If ANY trigger match: STOP. Do NOT draft PIP. Write **escalation note** (not PIP) to `performance-docs/pip-{employee-slug}.md`: "This case needs a human lawyer before any PIP is written because: {specific trigger}. The match: {class/activity} + {timing}." Add short paragraph on why (retaliation claims hinge on pretextual timing; fair PIP in this window still create risk). Append to `outputs.json` with `type: "performance-doc"`, `escalation: "needs-lawyer"`. Summarize: "Escalation triggered  -  stopped. Do not draft or deliver a PIP until a lawyer has reviewed. Specific trigger: {trigger}." Stop.
     4. Read recent check-ins. Last 4-6 `checkins/{YYYY-MM-DD}.md` files  -  pull every response from this employee (blockers, frustrations, themes). Read optional `employee-dossiers/{employee-slug}.md` for tenure, role history, recent performance notes, prior manager feedback. If missing, note gap + work from `checkins/` + your stated concerns.
     5. If clear, draft PIP with structure:
        - **Context**  -  what specifically underperforming, with concrete examples dated + sourced. Evidence-first. Never invent  -  if example can't sourced, leave out.
        - **Expectations**  -  what "meeting the bar" look like at this level, pulled from leveling framework. Each expectation observable + measurable.
        - **Milestones**  -  30 / 60 / 90-day checkpoints. Each name measurable criteria employee must demonstrate by that date. Tied to expectations, not vibes.
        - **Support**  -  what you + manager provide: weekly 1:1s, feedback cadence, training budget, pairing with senior, clearer project scope. PIP without real support = paper.
        - **Consequences**  -  what happens if milestones not met at 30 / 60 / 90. Plainly stated in your voice  -  neither softened nor threatening.
     6. **Write to `performance-docs/pip-{employee-slug}.md`** atomically (`*.tmp` → rename).

   - **If `type = stay-conversation`:**
     1. **Read retention-score reasoning.** If `analyses/retention-risk-{...}.md` flagged this employee RED, read reasoning block. Script surface themes signals revealed  -  never signals literally (employees don't need hear "your commit cadence dropped"; need hear "I've sensed something is off").
     2. Read recent check-ins. Last 4-6 `checkins/{YYYY-MM-DD}.md` files. Read optional `employee-dossiers/{employee-slug}.md` for tenure + role history.
     3. **Draft script** in five sections:
        - **Open**  -  warm, specific, your voice. One/two sentences that land purpose without ambushing.
        - **Listen**  -  3-4 open-ended questions designed get them talking first. What going well. What frustrating. What they'd change.
        - **Surface**  -  what you noticed, framed as observation not accusation. Draw from check-in themes + dossier history. Never cite engagement signals literally.
        - **Ask**  -  direct question: "What would make you want to stay here for another year?" (or equivalent in your voice). One clear ask.
        - **Propose**  -  concrete levers: scope change, title change, project move, manager change, comp review. Filter every lever against hard nos in `context/people-context.md`  -  if "we never counter-offer on resignations" written, comp off table; redirect to scope / title / project.
     4. Header at top of file: "**This is a script for a verbal 1:1, not an email. Do not send.**"
     5. **Write to `performance-docs/stay-conversation-{employee-slug}.md`** atomically (`*.tmp` → rename).

5. **Append to `outputs.json`** atomically (read-merge-write):
   ```json
   {
     "id": "<uuid v4>",
     "type": "<offer | onboarding-plan | performance-doc>",
     "title": "<plain title>",
     "summary": "<2-3 sentences>",
     "path": "<path>",
     "status": "draft",
     "escalation": "drafted | blocked-on-escalation | needs-lawyer | n/a",
     "createdAt": "<ISO>",
     "updatedAt": "<ISO>",
     "domain": "<hiring | onboarding | performance>"
   }
   ```
   - `offer-letter` → `type: "offer"`, `domain: "hiring"`, `escalation: "n/a"`.
   - `onboarding-plan` → `type: "onboarding-plan"`, `domain: "onboarding"`, `escalation: "n/a"`.
   - `pip` → `type: "performance-doc"`, `domain: "performance"`, escalation as classified (`drafted` when clear, `needs-lawyer` when triggered).
   - `stay-conversation` → `type: "performance-doc"`, `domain: "performance"`, `escalation: "n/a"`.
   - Status stays `draft`  -  this skill never flips to `ready`.

6. **Summarize to user.** One short paragraph in plain language: what you drafted, key elements, and the next move. Never mention file names or paths.
   - `offer-letter`: name, level, base, equity, start. Close: "This is a draft. I do not send offers. Review, edit, and send from your inbox."
   - `onboarding-plan`: start date, Day-0 checklist length, welcome messages drafted but not sent. "You ship them on the start date."
   - `pip` (clear): Context summary, 30/60/90 at glance, escalation classification. Close: "This is a draft. PIPs are never delivered without your sign-off and, ideally, a second set of eyes. Read, tell me what to change, flip status to `ready` after sign-off."
   - `pip` (escalated): "Escalation triggered  -  stopped. Do not draft or deliver a PIP until a lawyer has reviewed. Specific trigger: {trigger}."
   - `stay-conversation`: "This is a prompt for a verbal 1:1  -  don't send it. Read before your next 1:1 and adapt in the moment."

## What I never do

- Send, schedule, post, or deliver any draft. Founder delivers, sends, or has the conversation. Every artifact opens with a clear "DRAFT  -  NOT FOR DELIVERY" stamp, or "This is a script for a verbal 1:1, not an email" for stay conversations.
- Draft a PIP without running the escalation check first. No exceptions.
- Write a stay conversation as an email. Verbal by design. Decline + explain if asked for an email version.
- Recommend a counter-offer unless `context/people-context.md` explicitly allows it.
- Invent comp numbers, equity terms, leveling expectations, examples, dates, or quotes. If the source is missing, mark `UNKNOWN` and ask. Invented evidence destroys both legal and human legitimacy on PIPs.
- Promise benefits not in the policy canon.
- Commit a start date without founder confirmation.
- Modify HR platform / ATS / payroll records  -  read-only on every system of record.
- Flip any draft to `ready` automatically  -  you sign off.

## Outputs

- `offers/{candidate-slug}.md` (`type=offer-letter`).
- `onboarding-plans/{new-hire-slug}.md` (`type=onboarding-plan`).
- `performance-docs/pip-{employee-slug}.md` (`type=pip`).
- `performance-docs/stay-conversation-{employee-slug}.md` (`type=stay-conversation`).
- Appends to `outputs.json` with the per-type type, domain, and escalation classification.
