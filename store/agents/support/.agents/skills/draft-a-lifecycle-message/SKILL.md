---
name: draft-a-lifecycle-message
description: "Draft the messages that move customers through your lifecycle. A welcome series that walks new signups to their first win across five touches, a 90/60/30-day renewal sequence grounded in what the account actually achieved, a one-off expansion nudge when usage data shows someone hitting a ceiling, or a save message when a customer signals they want to leave. Every draft references real account data and your actual policies, nothing invented."
version: 1
category: Support
featured: no
image: headphone
integrations: [hubspot, attio, stripe, mailchimp, customerio, loops]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Draft a Lifecycle Message

One skill, every customer-lifecycle outreach your success motion need. Branches on `type`.

## When to use

- **welcome-series**  -  "draft onboarding for {segment}" / "welcome series for new signups" / "activation drip."
- **renewal**  -  "renewal coming for {account}" / "draft 30/60/90 for {account}" / "pre-renewal outreach."
- **expansion-nudge**  -  "they ready for {tier}" / "draft expansion nudge for {account}" / "ceiling signal for {account}."
- **churn-save**  -  "save {account}" / "draft save for {customer}" / "they asked to cancel."

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Email sender** (Loops / Customer.io / Mailchimp)  -  format the welcome series for whichever lifecycle tool you actually send from. Required for `welcome-series`.
- **CRM** (HubSpot / Attio)  -  pull account record, owner, plan history for personalization. Required for `renewal` / `expansion-nudge` / `churn-save`.
- **Billing** (Stripe)  -  read monthly revenue, plan, renewal date so I can ground the ask in real numbers. Required for `renewal` / `expansion-nudge`.

If none of the required categories are connected I stop and ask you to connect your CRM first.

## Information I need

I read your support context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Voice samples**  -  Required. Why I need it: lifecycle copy in the wrong voice gets ignored. If missing I ask: "Want me to mine your sent folder for tone, or can you drop 3 to 5 of your recent customer emails?"
- **Plan tiers + pricing**  -  Required. Why I need it: knowing what "upgrade" or "downgrade" means for this account. If missing I ask: "What plans do you sell and roughly what do they cost?"
- **Renewal cadence**  -  Required for `renewal`. Why I need it: 30/60/90 sequence keys to your renewal window. If missing I ask: "Are renewals annual, monthly, or something else  -  and when does this account's clock end?"
- **Approved save offers**  -  Required for `churn-save`. Why I need it: I won't invent a discount or credit. If missing I ask: "When someone tries to cancel, what can you actually offer them  -  pause, downgrade, refund, concierge time?"
- **Activation milestones**  -  Required for `welcome-series`. Why I need it: each touch needs a real "aha" event to push toward. If missing I ask: "What's the first thing a new signup needs to do for the product to click  -  and what comes next?"

## Parameter: `type`

- `welcome-series`  -  5-touch sequence day 0 / 1 / 3 / 7 / 14 for new signups in `{segment}`. Each touch: subject, preview, body, CTA, success metric. Writes `onboarding/{segment}.md`.
- `renewal`  -  3-touch pre-renewal sequence (Day-90 / Day-60 / Day-30) for `{account}`, grounded in account timeline. Each touch: subject, body, CTA, specific win to reference. Writes `renewals/{account}-{YYYY-MM-DD}.md`.
- `expansion-nudge`  -  ONE outreach for `{account}` grounded in specific ceiling signal (feature-adoption threshold, team-size change, repeated ask). Writes `expansions/{account}.md`.
- `churn-save`  -  ONE save message for `{account}` grounded in exact risk signal from `churn-flags.json`, offering genuine option (pause / downgrade / concierge / refund). Writes `saves/{account}.md`.

## Steps
<!-- houston-workflow:v1 -->

1. **Read `config/context-ledger.json` and `config/voice.md`.** Fill gap with one targeted question.
2. **Read `context/support-context.md`.** Missing → stop, tell me run `set-up-my-support-info` first.
3. **Branch on `type`:**
   - `welcome-series`: ask me `{segment}` if not given, draft 5 emails keyed to product's activation milestones (check `domains.email.journey` if set, else ask me name signup / activation / aha events).
     Format for connected ESP (Customer.io / Loops / Mailchimp / Kit via Composio). Include success metrics per touch.
   - `renewal`: chain `look-up-a-customer view=timeline` for account, pull wins, asks-shipped, friction. Draft Day-90 (value recap), Day-60 (expansion opportunity or renewal mechanics), Day-30 (direct ask + agenda). Every reference grounded in timeline artifact.
   - `expansion-nudge`: chain `look-up-a-customer view=health` to find ceiling signal. Draft short, specific outreach naming signal ("I noticed you added 3 seats  -  {tier} would lift the per-seat cap") and propose option. No upsell pressure; no real signal → stop, tell me.
   - `churn-save`: chain `look-up-a-customer view=churn-risk` to pull exact flag. Acknowledge risk honestly, name specific pain, offer pause / downgrade / concierge / refund  -  whichever policy in `context/support-context.md`. Never invent discount not pre-approved.
4. **Write artifact** atomic to path for this `type`.
5. **Append to `outputs.json`** with `type` = `onboarding-sequence` | `renewal-outreach` | `expansion-nudge` | `churn-save`, `domain: "success"`, title, summary, path, status `draft`.
6. **Summarize to me.** Headline: one-line hook or subject, specific signal grounding it, recommended send window.

## Outputs

- `onboarding/{segment}.md` (for `type = welcome-series`)
- `renewals/{account}-{YYYY-MM-DD}.md` (for `type = renewal`)
- `expansions/{account}.md` (for `type = expansion-nudge`)
- `saves/{account}.md` (for `type = churn-save`)
- Appends `outputs.json` with `domain: "success"`.

## What I never do

- Send. Every lifecycle message draft you review.
- Use guilt, fake scarcity, dark patterns (especially `churn-save` and `renewal`).
- Invent discount, credit, exception not in `context/support-context.md`.
- Draft `expansion-nudge` without real ceiling signal  -  data thin → stop, tell me.
