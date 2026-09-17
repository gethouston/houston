---
name: plan-a-campaign
description: "Plan a full campaign spec grounded in your positioning. Pick the type: a paid campaign with audience and budget, a product launch plan, a lifecycle drip, a welcome series, a churn-save email, or a feature announcement with email plus in-app copy. Specs only, I never send or launch."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [hubspot, stripe, linkedin, mailchimp, customerio, googleads, metaads]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Plan a Campaign

One skill, every campaign spec. `type` param picks shape; positioning, voice, ideal customer, "drafts only, no guilt tactics" shared.

## Parameter: `type`

- `paid`  -  audience + keywords / placement + ad-group structure + budget + landing-page requirement + KPIs.
- `launch`  -  2-week plan sequenced Day -7 → Day 0 → Day +7, each task tagged with skill inside THIS agent that executes it.
- `lifecycle-drip`  -  event-triggered drip with trigger + goal event + frequency rules + branching by user action + drafted emails.
- `welcome`  -  5-email series for new signups (Day 0 / 1 / 3 / 7 / 14 default, override any cadence).
- `churn-save`  -  save email offering ONE genuine option (pause / downgrade / concierge / refund). No guilt tactics.
- `announcement`  -  email copy + matching in-app copy (banner + modal + empty-state nudge), all keyed to same primary CTA.

User names type plain English, infer. If ambiguous, ask ONE question naming 6 options.

## When to use

- Explicit: "plan a paid campaign on {channel}", "plan the {feature} launch", "design a drip for {segment}", "draft a welcome series", "save email for {account}", "draft the {feature} announcement".
- Implicit: called after `audit-a-surface` (landing-page / site-seo) when founder ready to invest budget behind fixed page.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing → I name the category, ask you to connect it from the Integrations tab, stop.

- **Email platform (Customer.io, Loops, Mailchimp, Kit, etc.)**  -  draft drip / welcome / churn-save / announcement emails into your sender. Required for `lifecycle-drip`, `welcome`, `churn-save`, `announcement`.
- **Ad platforms (Google Ads, Meta Ads, LinkedIn Ads)**  -  pull account, audience, and keyword shape so the brief fits your real account. Required for `paid` (the channel you're planning).
- **CRM (HubSpot, Salesforce, Attio)**  -  segment audiences and pull behavioral triggers. Optional but lifts targeting accuracy.
- **Billing (Stripe)**  -  flag downgrade and cancel signals for `churn-save`. Required for `churn-save`.

If none of the required categories are connected for your campaign type I stop and ask you to connect the one that fits (your ESP for lifecycle work, the ad platform for paid).

## Information I need

I read your marketing context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your positioning**  -  Required for every type. Why I need it: targeting, objection handling, and the primary CTA all flow from it. If missing I ask: "Want me to draft your positioning first? It's one skill, takes about five minutes."
- **Your voice**  -  Required for `lifecycle-drip`, `welcome`, `churn-save`, `announcement`. Why I need it: emails written in chatbot voice get deleted. If missing I ask: "Connect your sent inbox so I can sample your voice, or paste two or three emails you've sent."
- **Your ideal customer**  -  Required. Why I need it: shapes targeting and copy angles. If missing I ask: "Who's the customer you're trying to win? A paragraph is fine, or point me at your CRM."
- **Your email platform and product journey**  -  Required for `lifecycle-drip`, `welcome`, `churn-save`, `announcement`. Why I need it: the drip plan keys to your real activation event. If missing I ask: "Which email tool do you use, and what's your activation moment, the thing a new user has to do for the product to click?"
- **Your ad channels, analytics, and primary conversion**  -  Required for `paid`. If missing I ask: "Which ad platform are we planning for, and what's the one conversion event the campaign needs to drive?"
- **Your save policy**  -  Required for `churn-save`. Why I need it: I won't draft offers you can't honor. If missing I ask: "What's the one genuine offer you'll make to a churning customer, a pause, a downgrade, a concierge call, or a refund window?"

## Steps
<!-- houston-workflow:v1 -->

1. **Read ledger + positioning.** Gather missing required fields per list above (ONE question each, best-modality first).
2. **Branch on type.**
   - `paid`: run `composio search {channel}` (googleads / metaads / linkedin-ads) find platform slugs. If connected, call list-accounts / list-keywords / list-audiences. Draft brief: **Objective** (one sentence tied to primary conversion), **Audience** (keywords for search; interests / lookalikes / job titles for social  -  grounded in ideal customer), **Budget plan** (daily + monthly, split by ad group), **Ad-group structure** (2-5 groups with theme + sample targeting), **Creative angles** (3-5 tied to pains / differentiators  -  hand to `write-a-post` or dedicated ad-copy skill for exact copy), **Landing-page requirement** (which URL per group; flag if `audit-a-surface` surface=landing-page should run first), **KPI targets** (cost per click / cost per thousand impressions / cost per acquisition / click-through rate with source cited), **Tracking** (events + UTMs), **Launch checklist**.
   - `launch`: ask for any missing launch inputs ONE tight question (feature name + target date, "why now" pain, audience segment, scale = soft / standard / big  -  default standard). Draft sequenced plan across three phases:
     - **Pre-launch (Day -7 → Day -1)**  -  positioning delta + launch narrative, blog post brief (→ `write-a-post` surface=blog), case study if applicable, paid creative brief (→ this skill type=paid), landing-page updates (→ `write-my-page-copy` + `audit-a-surface` surface=landing-page), announcement email + in-app spec (→ this skill type=announcement), teaser calendar across social platforms (→ `write-a-post` channels).
     - **Launch day (Day 0)**  -  hour-by-hour sequence, what ships when, who approves.
     - **Post-launch (Day +1 → Day +14)**  -  metrics to watch, follow-up content (case study / lessons-learned post), paid scale-up / kill rules, lifecycle drip refresh, next-week retro via `check-my-marketing` subject=marketing-health.
     Every task prefixed with in-agent skill that owns it (e.g. `[write-a-post:blog]`, `[plan-a-campaign:paid]`, `[write-my-page-copy:landing]`). Flag "what could kill this launch"  -  3 risks + mitigations.
   - `lifecycle-drip`: read / capture `domains.email.journey`. Name **trigger** (event or missing-event that enrolls user) and **goal event** (that exits them successfully). Default cadence 3 touches over 14 days, 72h minimum gap (honor user's stricter rules). Each email after first, branch on user action (goal action → exit; opened no action → variant A reframing value; didn't open → variant B fresh subject + shorter body + different send time; no action after final → mark cold, exit, optionally enroll in lower-frequency nurture). Draft subject + preview + body + single CTA + success metric per email. Include ASCII / bullet tree of branches.
   - `welcome`: default cadence Day 0 / 1 / 3 / 7 / 14. Default jobs per email: (1) welcome + fastest-path setup, (2) aha moment with concrete next action, (3) social proof / customer result, (4) habit formation / use-case expansion, (5) upgrade / plan-fit nudge. Each email: subject (≤50 chars, no ALL-CAPS), preview (50-90 chars), body (plain-text-first, voice-matched, references primary CTA from positioning), one primary CTA, success metric (one number this email should move).
   - `churn-save`: read or create `save-policy` in ledger (ask ONE question if missing: "what are you genuinely willing to offer? pause how long / downgrade to which plan / concierge with whom / refund within what window?"). Pick ONE genuine offer (don't stack). Draft: subject (no guilt, no fake scarcity), preview, body (3 short paragraphs  -  acknowledge, offer, ask what wasn't working; one primary CTA = the offer, one secondary = confirm cancel). Never: "we'll miss you", countdown timers, fake urgency, "other customers are…", emoji tears.
   - `announcement`: look for recent `launch`-type artifact in `campaigns/`; if present, key announcement to it (same primary CTA, narrative, audience). If absent, ask for feature name + value prop + segment + primary CTA. Draft BOTH: **Email** (subject ≤60 chars naming feature OR job, preview, body covering why-now / what-it-does / how-to-try / proof, one primary CTA, success metric = activation within N days). **In-app copy**  -  banner (one dismissible line ≤90 chars), modal (headline + 1-2 line body + primary button matching CTA + secondary "not now"), empty-state / contextual nudge (one line at exact surface feature improves).
3. **Write** atomically to `campaigns/{type}-{slug}.md` (`*.tmp` → rename). Slug: channel+theme for paid, feature+month for launch, campaign name or segment for lifecycle-drip, variant name for welcome, account-or-persona for churn-save, feature for announcement. Front-matter carries `type`, `primaryCta`, plus type-specific fields (trigger + goalEvent for drips, cadence for welcome, offer for churn-save, launchPlan path for announcement).
4. **Append to `outputs.json`**  -  read-merge-write atomically: `{ id (uuid v4), type: "campaign", title, summary, path, status: "draft", createdAt, updatedAt }`.
5. **Summarize to user.** One paragraph: objective + audience + biggest open question + path. For `launch`, lead with 3 highest-leverage tasks this week. For `churn-save`, lead with one genuine offer. For `announcement`, lead with one CTA wiring email + banner + modal + nudge.

## What I never do

- Launch campaign, send email, spend ad budget. Drafts / specs only.
- Use guilt, fake scarcity, countdown timers, dark patterns in save / re-engagement / popup-adjacent copy.
- Offer something user can't deliver ("free concierge forever").
- Invent customer facts, milestone data, retention numbers, competitor ad spend.
- Hardcode tool names. Composio discovery at runtime only.

## Outputs

- `campaigns/{type}-{slug}.md`
- Append entry to `outputs.json` with type `campaign`.
