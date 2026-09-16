---
name: look-up-a-customer
description: "Give me a customer name and pick what you need: a dossier with their plan, history, and open items; a full timeline of every interaction; a health score (green/yellow/red) with the three signals driving it; or a churn-risk check that tells you if they're slipping and what to do about it. One customer, four angles."
version: 1
category: Support
featured: no
image: headphone
integrations: [gmail, hubspot, salesforce, attio, stripe]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Look Up a Customer

One skill for every "tell me about this customer" ask support motion need. Branch on `view`.

## When to use

- **dossier**  -  "who is this customer?" / "tell me about {account}" / implicit before `draft-a-reply` run.
- **timeline**  -  "show me the full timeline for {account}" / "history on {customer}" / implicit before `review-my-support scope=account-review` or `draft-a-lifecycle-message type=renewal`.
- **health**  -  "score health for {account}" / "how's {customer} doing" / "run health."
- **churn-risk**  -  "churn risk on {account}" / "scan for churn risk" / "is this customer at risk?"

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **CRM** (HubSpot / Attio / Salesforce)  -  pull plan tier, owner, account record. Required.
- **Billing** (Stripe)  -  pull monthly revenue, plan, renewal date, downgrade signals. Required for `health` and `churn-risk`.
- **Inbox** (Gmail / Outlook)  -  fetch full conversation history for the timeline view. Optional if `conversations.json` already populated.

If none of the required categories are connected I stop and ask you to connect your CRM first.

## Information I need

I read your support context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Plan tiers + their weights**  -  Required. Why I need it: ranks signals correctly so a P1 customer's churn flag isn't buried. If missing I ask: "What plans do you sell, and which ones count as your top tier?"
- **Where conversation history lives**  -  Required. Why I need it: I need to pull the full account timeline. If missing I ask: "Which inbox or help-desk holds your customer threads  -  want me to pull from a connected one or should you drop a recent export?"
- **What 'at-risk' looks like for you**  -  Required for `health` / `churn-risk`. Why I need it: thresholds for GREEN / YELLOW / RED come from your operating definition, not mine. If missing I ask: "What signals tell you a customer's about to churn  -  drop in usage, support ticket spike, cancellation language, something else?"

## Parameter: `view`

- `dossier`  -  profile + plan + monthly revenue (via connected Stripe) + open bug-candidates + open followups + last 3 conversations. Writes to `dossiers/{slug}.md`.
- `timeline`  -  chronological rollup of every interaction (ticket, call, purchase, plan change, satisfaction score). Writes to `timelines/{slug}.md`.
- `health`  -  GREEN / YELLOW / RED with 3 driving signals, reasoning, ONE recommended action. Writes entry to `health-scores.json` (and prose version at `dossiers/{slug}-health.md` if I ask).
- `churn-risk`  -  open risk flag with signal (cancellation language, repeated friction, usage cliff), severity, recommended action. Writes entry to `churn-flags.json`.

## Steps
<!-- houston-workflow:v1 -->

1. **Resolve `{account}` or `{slug}`.** Gave customer name? Look up in `customers.json` by name / email / domain. No match? Ask for CRM identifier (HubSpot / Attio / Salesforce via Composio) or paste profile.
2. **Read `config/context-ledger.json`.** Fill gaps.
3. **Branch on `view`:**
   - `dossier`: read CRM record + `customers.json` + filter `conversations.json` to this customer + check `bug-candidates.json`, `followups.json`, `churn-flags.json`. Pull monthly revenue / plan from connected Stripe. Write `dossiers/{slug}.md`.
   - `timeline`: same reads as `dossier` but also pull every conversation, plan change, invoice, satisfaction score from connected Stripe + CRM. Sort chronologically. Write `timelines/{slug}.md`.
   - `health`: compute 3 signals (e.g. last-30-day ticket volume, recent product-usage trend via PostHog, sentiment of last 3 interactions). Apply thresholds from `domains.success.churnSignals` (ask me to define if unset). Output GREEN / YELLOW / RED + one action. Write to `health-scores.json` (read-merge-write).
   - `churn-risk`: scan last 60 days of conversations for cancellation language, 2+ frustration signals, or usage cliff. Found? Write new entry to `churn-flags.json` with signal + severity + recommended next move.
4. **Append to `outputs.json`** with appropriate `type`: `dossier` | `timeline` | `health-score` | `churn-risk`, `domain: "inbox"`, title, summary, path.
5. **Summarize to me** terse: headline (plan + status) + single most useful next move.

## Outputs

- `dossiers/{slug}.md` (for `view = dossier`)
- `timelines/{slug}.md` (for `view = timeline`)
- `health-scores.json` entry (for `view = health`)
- `churn-flags.json` entry (for `view = churn-risk`)
- Appends to `outputs.json` with `domain: "inbox"`.

## What I never do

- Surface health score or churn flag I can't ground in data from `conversations.json`, Stripe, or CRM  -  mark UNKNOWN and ask.
- Invent plan / monthly revenue / usage numbers when connection missing.
