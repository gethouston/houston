---
name: measure-my-marketing
description: "Set up the measurement you need so you're not guessing. Pick what you need: an event tracking plan you can hand a developer, a full A/B test spec with hypothesis and sample size, or a weekly LinkedIn digest showing how your posts performed and who's worth engaging with."
version: 1
category: Marketing
featured: no
image: megaphone
integrations: [linkedin, reddit]
x_houston:
  created_by: houston
  skill_schema: 1
---


# Measure My Marketing

One skill for every measurement job. `scope` param picks the output shape: a developer-ready event tracking spec, a rigorous A/B test doc, or a weekly LinkedIn performance digest. All grounded in your positioning so you measure what matters to your ideal customer, not vanity numbers.

## Parameter: `scope`

- `tracking-plan`  -  event-tracking plan (event name, trigger, properties, owner per step) plus a UTM matrix so paid / social / email are comparable in GA4 / your analytics. Output: `tracking-plans/{slug}.md`.
- `ab-test`  -  full test spec covering hypothesis (PICOT), control vs variant, primary + secondary metrics, sample-size estimate with MDE + power, duration, and go/no-go criteria. Output: `ab-tests/{slug}.md`.
- `linkedin-digest`  -  weekly digest of your own post stats (reach, engagement, new followers) plus notable network posts worth engaging with. Output: `linkedin-digests/{YYYY-MM-DD}.md`.

User names scope in plain English ("spec event tracking for signup", "A/B test for the pricing page", "LinkedIn digest", "how did my posts do") -> infer. Ambiguous -> ask ONE question naming all three options.

## When to use

**tracking-plan:**
- "Spec event tracking for signup -> activation"
- "UTM plan for the Q2 campaigns"
- "Tracking plan for the new pricing page"
- Called by `plan-a-campaign` when campaign needs events or UTMs that don't exist yet.

**ab-test:**
- "A/B test for the pricing page headline"
- "Design an experiment for {proposed change}"
- "Hypothesis for swapping {X} to {Y}"
- Often follows `audit-a-surface` (surface=landing-page) when fixes flagged are non-obvious -> design test.

**linkedin-digest:**
- "LinkedIn digest" / "how did my posts do this week" / "weekly LinkedIn roundup" / "what did my network post".
- Weekly  -  Friday / Sunday-evening routine.

## Connections I need

I run external work through Composio. Before this skill runs I check that the categories below are linked. Missing -> I name the category, ask you to connect it from the Integrations tab, stop.

- **Analytics (PostHog, GA4, Mixpanel)**  -  needed for `tracking-plan` (destination conventions) and `ab-test` (read baseline conversion rate and current traffic so the sample-size estimate isn't a guess). For `tracking-plan`: if "none" I spec a plan and recommend connecting PostHog (free tier) before shipping. For `ab-test`: required if you want a real estimate, optional if you paste the baseline.
- **LinkedIn**  -  Required for `linkedin-digest` (pull your post stats and your network's posts). No paste fallback exists for LinkedIn engagement data. Not needed for other scopes.

If no analytics tool is connected for `tracking-plan` I keep going with the spec and call it out, but recommend connecting PostHog or GA4 before implementation.

If no analytics tool is connected for `ab-test` I stop and ask you to connect one, or paste your baseline conversion rate plus weekly traffic.

If LinkedIn isn't connected for `linkedin-digest` I stop and ask you to link it from the Integrations tab.

## Information I need

I read your marketing context first. For every required field that's missing I ask ONE plain-language question (best modality: connected app > file drop > URL > paste) and wait.

- **Your positioning**  -  Required (all scopes). Why I need it: for `tracking-plan` it tells me what counts as a meaningful event versus noise; for `ab-test` the hypothesis has to tie back to a real ideal customer pain or objection; for `linkedin-digest` I judge posts against your category and ideal customer. If missing I ask: "Want me to draft your positioning first? It's one skill, takes about five minutes."
- **Your primary conversion event**  -  Required for `tracking-plan` and `ab-test`. Why I need it: every flow ends in a measurable success event (`tracking-plan`); that's the test's primary metric (`ab-test`). If missing I ask: "What's the one event that means this flow worked, signup, activation, purchase, demo booked?"
- **The flow to spec**  -  Required for `tracking-plan`. Why I need it: tracking plans are scoped to one flow at a time. If missing I ask: "Which flow are we tracking, signup, activation, pricing-to-checkout, campaign attribution, or something else?"
- **Your ad channels**  -  Optional for `tracking-plan`, only if you want a UTM matrix that names them. If missing I ask: "Which channels do you want UTM templates for, Google, Meta, LinkedIn, newsletter, organic social? If you don't have a list I keep going with the common defaults."
- **The variable to test**  -  Required for `ab-test`. Why I need it: one variable per test, no multivariate hacks. If missing I ask: "Which one element are we testing, headline, hero image, CTA copy, pricing layout, trust badges, or something else?"
- **Baseline conversion rate**  -  Required for `ab-test`. Why I need it: drives the sample-size calculation. If missing I ask: "What's the current conversion rate for this page or flow? If you don't have a number I keep going with assumptions and flag them."
- **Weekly traffic**  -  Required for `ab-test`. Why I need it: turns sample size into "days of traffic." If missing I ask: "Roughly how many visitors hit this surface per week?"
- **Your topics**  -  Required for `linkedin-digest`. Why I need it: filters which network posts are worth engaging with. If missing I ask: "What topics do you want me to track, three to five themes you actually care about?"

## Steps
<!-- houston-workflow:v1 -->

### Shared steps (all scopes)

1. **Read positioning doc** at `context/marketing-context.md`. If missing, tell user run `set-up-my-marketing-info` first and stop.
2. **Read relevant config** for scope  -  details in each branch below.

### Branch on `scope`:

#### `tracking-plan`

3. **Read config:** `config/analytics.json`, `config/conversion.json`, `config/tracking-prefs.json` if present. If analytics stack "none", flag tracking can be specced but not implemented  -  recommend connecting PostHog (free tier) or GA4 via Composio as minimum.
4. **Clarify flow.** User name flow  -  "signup", "activation", "pricing-page -> checkout", "campaign attribution". Map to discrete steps (3-7 typical). Ask ONE question if flow boundary unclear (start event? success event?).
5. **Event-tracking spec**  -  one row per event:
   - `eventName` (snake_case, verb-led: `signup_started`, `signup_completed`, `checkout_viewed`, `checkout_completed`).
   - `trigger` (UI action / server event / URL match).
   - `properties`  -  3-6 per event, minimum `user_id`, `anonymous_id`, `timestamp`, and flow-specific dimensions (plan, channel, referrer).
   - `destination`  -  which tool (GA4 / PostHog / Mixpanel / Segment router / server).
   - `owner`  -  who ship (solo founder -> "you"; else role).
   - `status`  -  `proposed` / `live` / `deprecated`.
6. **UTM matrix**  -  naming rules so every campaign tag consistent:
   - `utm_source`  -  platform (`google` / `meta` / `linkedin` / `reddit` / `newsletter` / `x`).
   - `utm_medium`  -  channel type (`cpc` / `paid-social` / `email` / `organic-social` / `referral`).
   - `utm_campaign`  -  kebab-case `{yyyy-qX}-{theme}` (e.g. `2026-q2-founder-launch`).
   - `utm_content`  -  variant / creative slot (kebab-case).
   - `utm_term`  -  keyword (search only).
   Include filled example row per active channel from `config/channels.json`.
7. **QA checklist**  -  5-10 items: event fires on expected trigger, dedupe handled, no PII in properties, consent signals respected, UTM params preserved through redirects.
8. **Write** atomically to `tracking-plans/{slug}.md` (`*.tmp` -> rename). Save naming conventions to `config/tracking-prefs.json` so future runs reuse.
9. **Append to `outputs.json`**  -  `{ id, type: "tracking-plan", title, summary, path, status: "ready", createdAt, updatedAt }`.
10. **Summarize to user**  -  number events specced, UTM template to copy, path to plan.

#### `ab-test`

3. **Read config:** `config/conversion.json` (primary event + baseline rate if set), `config/analytics.json` (tool powering test).
4. **Clarify variable.** If user named change vaguely ("test the pricing page"), ask one question: "Which element  -  headline, hero image, CTA copy, pricing table layout, trust badges, or something else?" Pick one variable. No multi-variable tests v1.
5. **PICOT hypothesis:**
   - **P**  -  Population (who sees it).
   - **I**  -  Intervention (variant change).
   - **C**  -  Comparison (control = current page).
   - **O**  -  Outcome (primary metric).
   - **T**  -  Time (test duration).
   Write as one sentence: "Among {P}, changing {I} vs. {C} will improve {O} by at least {MDE}% within {T}."
6. **Metrics:**
   - **Primary**  -  conversion event from `config/conversion.json`.
   - **Secondary**  -  2-3 guardrails (bounce rate, time-on-page, downstream activation).
   - **Non-metrics**  -  things NOT measuring (prevents post-hoc fishing).
7. **Sample-size estimate.** Given baseline conversion rate (from config or user paste), target MDE (ask user; default 10% relative), alpha 0.05, power 0.80  -  compute required sample per variant using standard two-proportion z-test formula. Show numbers. Translate to "days of traffic" using current volume. If baseline or volume unknown, state assumptions and mark number as estimate.
8. **Duration + stop conditions.**
   - Minimum duration (full business cycle, e.g. 7 or 14 days even if sample hits sooner  -  avoids weekday bias).
   - Peeking policy (no peek-and-stop; Bayesian tools excepted).
   - Hard-stop conditions (negative guardrail breach > X%).
9. **Go / no-go criteria.** What result ships variant, what result kills it, what result runs follow-up test.
10. **Implementation notes.** Tool executing test, event IDs powering it (link to `tracking-plans/` if exists), who QAs before launch.
11. **Write** atomically to `ab-tests/{slug}.md` (`*.tmp` -> rename).
12. **Append to `outputs.json`**  -  `{ id, type: "ab-test", title, summary, path, status: "draft", createdAt, updatedAt }`.
13. **Summarize to user**  -  one-sentence hypothesis, required sample, duration, path to doc.

#### `linkedin-digest`

3. **Read `config/platforms.json`, `config/topics.json`.** Confirm LinkedIn in `active` and `connectedViaComposio`. If not connected, tell user link via Integrations tab and stop  -  skill needs API.
4. **Pull own-post stats.** Run `composio search linkedin` to find post-stats / list-own-posts tool. Execute. Pull user posts from last 7 days with:
   - impressions / reach
   - reactions / comments / shares / reposts
   - new followers gained that day if available
   Missing metric -> mark TBD, note likely cause (e.g. "LinkedIn API doesn't expose per-post new-follower delta").
5. **Pull network posts.** Same LinkedIn category, find feed-read tool. Pull last 7 days from user connections. Filter for high-engagement (top decile by reactions) OR topical relevance to `config/topics.json`. Keep top 5-10.
6. **Compute roundup.** Produce:
   - **Your week at a glance**  -  post count, total impressions, total engagement, follower delta, best post, worst post.
   - **Patterns**  -  one-line read on what worked (hook length, topic, time-of-day if surfaceable). Cite specific posts.
   - **Network highlights**  -  5-10 connection posts worth reaction or reply. Each: one-line relevance + suggested action (reply / react / ignore).
7. **Write** to `linkedin-digests/{YYYY-MM-DD}.md` atomically. Structure:
   ```markdown
   # LinkedIn Digest  -  week ending {YYYY-MM-DD}

   ## Your week
   - Posts: {N}
   - Impressions: {total} ({delta vs prior week})
   - Engagement: {reactions} reactions . {comments} comments . {shares} shares
   - New followers: {count or TBD}
   - Best post: [{title or hook}]({url})  -  {metric}
   - Worst post: [{title or hook}]({url})  -  {metric}

   ## What worked
   - {one-line pattern, cited}
   - {one-line pattern, cited}

   ## Network highlights
   1. **{Author}**  -  {one-line post summary} ({URL})
      Suggested action: {reply / react / ignore} . {why}
   2. ...

   ---

   ## Notes
   - Data freshness: pulled {ISO timestamp}
   - Any TBDs: {list}
   ```
8. **Append to `outputs.json`**  -  new entry, `type: "linkedin-digest"`, `path: "linkedin-digests/{YYYY-MM-DD}.md"`, `status: "draft"`.
9. **Summarize to user**  -  one paragraph: "Week ending {date}: {N} posts, {impressions} impressions, best was {title} ({metric}). {count} network highlights flagged. Full digest at {path}."

## What I never do

- Push tags or events live  -  founder (or dev) ships the implementation. Every tracking plan is a spec you hand off.
- Claim lift before a test runs. Every hypothesis is "expected directional effect + why"  -  not "this will convert better."
- Fabricate baseline conversion rates, traffic numbers, or LinkedIn metrics. Tool didn't return data -> mark TBD.
- Run multi-variable tests v1  -  one variable per test.
- Send, post, or publish anything  -  you ship every artifact.

## Outputs

- `tracking-plans/{slug}.md` (scope=tracking-plan) + writes/updates `config/tracking-prefs.json`
- `ab-tests/{slug}.md` (scope=ab-test)
- `linkedin-digests/{YYYY-MM-DD}.md` (scope=linkedin-digest)
- All append to `outputs.json` with matching `type`: `"tracking-plan"` | `"ab-test"` | `"linkedin-digest"`.
