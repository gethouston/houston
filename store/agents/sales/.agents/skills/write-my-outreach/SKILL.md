---
name: write-my-outreach
description: "Draft the outreach you need: a grounded cold email, a sixty-second cold-call script, a post-call follow-up, an inbound reply, a renewal note, or a churn-save email. Every draft is voice-matched to your sent inbox, anchored in your playbook, and stays in a file until you copy and send."
version: 1
category: Sales
featured: yes
image: handshake
integrations: [googlecalendar, gmail, outlook, hubspot, salesforce, attio, pipedrive, gong, fireflies, stripe]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Write My Outreach

One skill, every outreach surface. `stage` param pick shape; voice-match, honest proof, "never invent quote" discipline shared.

## Parameter: `stage`

- `cold-email`  -  grounded first-touch email (3 short paragraphs max): cited trigger signal → specific pain → one-line ask. Replaces generic "who handles X" email.
- `cold-script`  -  60-90s cold-call script: opener, pattern-interrupt, 2 discovery questions, soft CTA, landmine to avoid.
- `followup`  -  post-call recap + confirmed next step email, your voice. Pulls call analysis from `calls/{slug}/`.
- `inbound-reply`  -  classify inbound as `interested` / `asking-question` / `objection` / `not-now` / `unsubscribe`, draft right reply. Flags spam / wrong-person clean.
- `renewal`  -  bundle shipped outcomes, expansion levers, pricing reasoning into renewal draft. Never commits pricing outside playbook.
- `churn-save`  -  non-defensive save. Names specific signal (downgrade, usage drop, support escalation), offers one concrete remedy, proposes dated next step. No guilt, no fake scarcity.

User names stage in plain English ("cold email", "call script", "follow up", "reply", "renewal note", "save email") → infer. Ambiguous → ask ONE question naming 6 options.

## When to use

- Explicit: any trigger phrase in description.
- Implicit: inside `check-my-sales subject=discovery-call` (analysis ends with drafted followup), inside `score-my-pipeline subject=customer-health` (red → churn-save), inside `manage-my-crm action=route` (interested inbound → cold-email or followup).

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Inbox**  -  sample your sent emails to learn your voice. Required for every email-shaped stage.
- **CRM**  -  read deal context (owner, stage, last touch) for `followup`, `renewal`, `churn-save`. Required for those stages.
- **Calendar**  -  suggest meeting slots in `inbound-reply`. Optional.
- **Scrape / Search**  -  fresh signal search for `cold-email`. Required for that stage.
- **Meetings**  -  pull call transcripts to ground `followup`. Optional.
- **Billing**  -  pull Stripe downgrade or cancel signal for `churn-save`. Optional.

If none of the required categories are connected I stop and ask you to connect your inbox first since voice-matching grounds every draft.

## Information I need

I read your sales context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your sales playbook**  -  Required. Why I need it: pricing stance, objection handbook, primary first-call goal, ideal customer profile all anchor the draft. If missing I ask: "I don't have your playbook yet  -  want me to draft it now?"
- **Voice samples**  -  Required for every email-shaped stage. Why I need it: drafts sound like you, not a template. If missing I ask: "Connect your inbox so I can read your last 30 sent emails, or paste 3 to 5 emails you've written recently."
- **The target lead, deal, or customer**  -  Required. Why I need it: every draft is grounded to a specific person. If missing I ask: "Who's this draft for  -  which prospect, deal, or customer?"
- **Connected CRM**  -  Required for `followup`, `renewal`, `churn-save`. Why I need it: I pull deal stage, owner, and last touch. If missing I ask: "Connect your CRM (HubSpot, Salesforce, Attio, Pipedrive, or Close), or paste the deal context."
- **Connected billing**  -  Optional, helpful for `churn-save`. Why I need it: I anchor the save in the actual downgrade or cancel signal. If you don't have it I keep going with TBD and ask you to describe the signal.

## Steps
<!-- houston-workflow:v1 -->

1. **Read ledger + playbook.** Gather missing required fields per above (ONE question each, best-modality first). Write atomically.

2. **Branch on stage.**
   - `cold-email`: run fresh signal search (recent news, job openings, funding, product launch) via Composio-discovered scrape / search slugs. Pick SINGLE strongest signal. Open with specific signal line 1 (not "hope this finds you well"). Draft 3 short paragraphs: signal → specific pain (from playbook, grounded in ideal customer profile) → one-line ask. Subject cites signal. Max 110 words body. Save to `outreach/email-{lead-slug}-{YYYY-MM-DD}.md`.
   - `cold-script`: dossier from `leads/{slug}/` (or ask). Structure: **Opener** (15s, reason for call), **Pattern-interrupt** (one specific observation unique to them), **Discovery** (2 questions matched to weakest qualification pillar for segment from playbook), **Soft CTA** (calendar link, 15m next week), **Landmine to avoid** (one thing from `call-insights/` flagged loss pattern). Save to `outreach/script-{lead-slug}-{YYYY-MM-DD}.md`.
   - `followup`: read latest `calls/{deal-slug}/notes-*.md` and `analysis-*.md`. Subject: "Re: {their pain, in their words}". Body: confirm we heard them → 2-3 bullets answering stated objection / open question → next step with specific date. Match voice. Save to `deals/{deal-slug}/followup-{YYYY-MM-DD}.md` AND mirror to `outreach/email-{deal-slug}-{date}.md` for outreach index.
   - `inbound-reply`: read pasted or Composio-pulled reply. Classify (interested / asking-question / objection / not-now / unsubscribe / spam). `interested` → draft booking reply with 2-3 slot suggestions (pull Google Calendar if connected). `asking-question` → answer inline if playbook covers; else flag for user. `objection` → chain into `handle-an-objection`. `not-now` → draft polite "circle back in {N} weeks" note. `unsubscribe` / `spam` → queue right CRM action via `manage-my-crm action=queue-followup` and stop. Save to `outreach/inbound-reply-{lead-slug}-{YYYY-MM-DD}.md`.
   - `renewal`: read `customers/{slug}/` history (onboarding plan, QBRs, health scores). Structure: shipped outcomes (numbers from playbook's success-metric definition) → expansion levers (feature-request patterns, team growth signal) → pricing reasoning (from playbook  -  never commit). End dated next step. Save to `customers/{slug}/renewal-{YYYY-MM-DD}.md`.
   - `churn-save`: read downgrade / cancel / usage-drop signal (from Stripe via Composio, or pasted). Structure: name specific signal verbatim → one concrete remedy (pause, downgrade further, concierge help, refund  -  genuine option matching signal, not all four) → proposed dated next step. No guilt, no fake scarcity. Save to `customers/{slug}/save-{YYYY-MM-DD}.md`.

3. **Voice check.** Before finalize, compare against `config/voice.md`: sentence length, greeting habit, closing habit, forbidden phrases. Rewrite offending lines.

4. **Sanity-check against playbook.** Any claim re pricing, timelines, anchor accounts must match `context/sales-context.md`. No commitments outside pricing stance. No fabricated customer names.

5. **Append to `outputs.json`**  -  read-merge-write atomically: `{ id (uuid v4), type: "outreach", title: "{Stage}  -  {target}", summary: "<subject line + next step>", path, status: "draft", createdAt, updatedAt, domain: "<outbound | inbound | retention>"}`. Domain: `cold-email` + `cold-script` → `outbound`; `inbound-reply` → `inbound`; `followup` → `meetings`; `renewal` + `churn-save` → `retention`.

6. **Summarize to user.** Subject line + next step inline. Path to full draft. Explicit: "I never send  -  copy from file or open inbox to send."

## What I never do

- Send, post, schedule. Every draft stays in file until you copy.
- Invent customer quote, metric, competitor claim. Source thin → mark `TBD  -  {what to bring}` and ask.
- Commit pricing outside playbook's pricing stance  -  surface exception with `FLAG: needs approval`.
- Use guilt, fake scarcity, dark patterns in `churn-save` / `renewal`.
- Hardcode tool names  -  Composio discovery at runtime only.

## Outputs

- `outreach/{channel}-{slug}-{YYYY-MM-DD}.md` where `channel` = `email` (cold-email, followup, inbound-reply) / `script` (cold-script).
- `followup`: mirrors into `deals/{slug}/followup-{date}.md`.
- `renewal` / `churn-save`: writes to `customers/{slug}/`.
- Appends to `outputs.json` with `type: "outreach"`.