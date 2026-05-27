# Data Rituals — how to actually USE the analytics

The dashboards are the easy part. This doc is the hard part: the discipline that turns "we have analytics" into "we're data-driven."

Read this once start to finish, then keep it open every morning for a week.

## Where to find what

PostHog project ID = `396231` (org `houston-tgsg`). Sentry org `houston-cd`. Bookmark these.

### Canonical dashboards (pinned, tag `canonical-2026-05`)

| # | Dashboard | URL | Opens with |
|---|---|---|---|
| 1 | Acquisition | https://us.posthog.com/project/396231/dashboard/1631626 | Where users come from |
| 2 | Activation | https://us.posthog.com/project/396231/dashboard/1631629 | Where the funnel leaks |
| 3 | Engagement | https://us.posthog.com/project/396231/dashboard/1631631 | Are users actually using it |
| 4 | Retention | https://us.posthog.com/project/396231/dashboard/1631635 | Do they come back |
| 5 | Feature Adoption | https://us.posthog.com/project/396231/dashboard/1631636 | Which features pull weight |
| 6 | Reliability | https://us.posthog.com/project/396231/dashboard/1631644 | What breaks for users |
| 7 | AI Usage | https://us.posthog.com/project/396231/dashboard/1631647 | LLM cost/latency/errors |
| 8 | B2B | https://us.posthog.com/project/396231/dashboard/1631648 | Org adoption signals |

The numbered prefix (`Houston / 1. Acquisition`) sorts them in the PostHog sidebar so daily reading order matches the natural flow: acquire → activate → engage → retain.

Old dashboards (`Houston Growth + Reliability`, `Houston Acquisition Funnel`, `My App Dashboard`) are kept but **tagged `legacy-pre-2026-05` and unpinned**. The insights inside them still live (most are cross-attached to the new dashboards). Delete them whenever you're comfortable.

### Saved cohorts (`canonical-2026-05`)

| Cohort | Use when |
|---|---|
| Activated users (id 329391) | Denominator for retention curves; inclusion filter for "real users only" insights |
| Stale-version users (id 329396) | Email outreach to users who never auto-updated. Refresh slug after each release. |
| B2B users (company email) (id 329392) | Org-adoption analyses; filter any engagement insight by this |
| Power users (10+ msgs/7d) (id 329393) | User interviews, NPS, advisor input |
| Lost users (no app_active 30d) (id 329394) | Win-back email targets (intersect with B2B for highest-leverage list) |
| Internal / Test users (id 275230) | EXCLUDE from every insight via `not in cohort` filter |

### Quick reference

| Question | Tool | Where exactly |
|---|---|---|
| "What's breaking?" | Sentry | https://houston-cd.sentry.io → Issues |
| "How are users behaving?" | PostHog | Dashboards 1–4 (the daily reading order) |
| "Why did a metric spike on Tuesday?" | PostHog | Release annotations live on every chart; `release.yml` posts them on every tag |
| "Who downloaded yesterday?" | PostHog | Acquisition dashboard → "Installs by first-touch UTM campaign" |
| "Is feature X working out?" | PostHog | Feature Adoption dashboard, before/after release annotation |

## Daily ritual (5 minutes, every morning)

This is the habit that compounds. Do it at the same time each day.

### Step 1 — Reliability (1 min)
Open Sentry. Look at **Issues → Unresolved → sort by Events**. That's your queue.

If there are ≥ 3 issues with > 50 events in the last 24h, send them to the reliability engineer in Slack. Don't triage in your head — let Sentry rank.

The Claude-driven version of this:
```
merge execute-tool sentry__list_issues '{
  "organization_slug":"houston-cd",
  "project_slug":"houston-app",
  "input_data":{"statsPeriod":"24h","query":"is:unresolved environment:production sort:freq","cursor":null}
}'
```
First 10 results = the day's queue.

### Step 2 — Growth (2 min)
Open PostHog → **Growth** dashboard. Three numbers:
- Yesterday's installs (acquisition tile)
- Yesterday's DAU (engagement tile)
- Yesterday's activation rate (activation tile — % of new installs who hit `chat_message_received` within 24h)

Compare each to the trailing 7-day average. If any is ≥ 20% off, dig.

### Step 3 — Campaign attribution (2 min, only when running campaigns)
Open PostHog → **Acquisition Sources** tile. Look at `$initial_utm_campaign` breakdown for the last 7 days. Any campaign you've launched in the last 2 weeks should be showing up. If a launched campaign has 0 attributed installs after 48h, something's wrong with the link (missing UTMs, typo'd campaign slug).

## Weekly ritual (30 minutes, Monday morning)

### Step 1 — Pull last week's numbers
Open PostHog dashboards. For each metric below, note the value and the week-over-week change:

- New installs
- Activated users (`chat_message_received` first-fire count)
- D7 retention (% of last-week-Monday installs who came back)
- Errors per user (`app_error_shown` count / DAU)
- Top feature events (which `skill_used` / `tab_opened` values are up?)

### Step 2 — Read the release notes
Look at the PostHog chart with release annotations turned on. Did anything we shipped move a metric? Did anything we shipped BREAK a metric (look at Sentry events tagged with the new release)?

### Step 3 — Grade open campaigns
For every campaign with a doc in `growth/campaigns/*.md` that started ≥ 14 days ago:
- Open the PostHog cohort `$initial_utm_campaign = <slug>`
- Fill in the "Result" section of the campaign doc
- Decide: do this again? Adjust? Kill?

### Step 4 — Write up a 5-line update
Just for yourself. Five lines:
```
Week of YYYY-MM-DD
- installs: N (Δ X% WoW)
- activated: N (X% conversion)
- biggest surprise: ...
- biggest worry: ...
- shipping this week: ...
```

Investor updates write themselves when you have this archive.

## Monthly ritual (1 hour, first Monday of the month)

### Step 1 — Cohort retention
PostHog → Retention dashboard. Look at the cohort-by-week retention curve. Is each week's cohort retaining better, worse, or the same as the cohorts before it?

If retention is FLAT, the product isn't getting stickier — you can grow installs all you want, the bucket has a hole.

If retention is RISING, growth multiplies. Pour resources here.

If retention is FALLING for new cohorts vs old ones, something you shipped is making the product WORSE for new users specifically. Investigate the most recent ~3 releases.

### Step 2 — Cost per activated user
For every campaign that ran this month, compute cost / activated_users from the campaign docs. Rank campaigns by efficiency. Double down on the top 3, stop the bottom 3.

### Step 3 — Feature kill candidates
Open Feature Adoption dashboard. Any feature with `usage rate < 5% of DAU` AND `time since shipped > 60 days` is a kill candidate. Killing dead features makes the product better — fewer concepts to learn, less code to maintain.

### Step 4 — Sentry close-out report
Sentry → Issues → Resolved → filter to "this month". This is the engineer's win list. Count issues resolved, biggest issues killed.

The Claude-driven version:
```
merge execute-tool sentry__list_issues '{
  "organization_slug":"houston-cd",
  "project_slug":"houston-app",
  "input_data":{"statsPeriod":"30d","query":"is:resolved environment:production","cursor":null}
}'
```

## What each dashboard is for

### Acquisition
Open with: **"How many new people heard about us and converted?"**

Tiles:
- Installs per day (last 30 days)
- Top traffic sources (breakdown by `$initial_utm_source`)
- Top campaigns (breakdown by `$initial_utm_campaign`)
- Conversion: website-pageview → install (when website tracking is live)

Red flag: a previously-strong channel drops > 30% week-over-week without explanation.

### Activation
Open with: **"Where in the funnel do we lose people?"**

Tiles:
- Full funnel: `install_created` → `workspace_created` → `provider_configured` → `agent_created` → `chat_message_sent` → `chat_message_received`
- Drop-off heatmap (which step bleeds the most users?)
- Time-to-activation distribution (median minutes from install to first reply)
- Activation rate, cohorted by signup week (is it getting better or worse over time?)

Red flag: drop-off > 50% at any single step that wasn't there last week.

### Engagement
Open with: **"Are users actually using Houston, or just trying it?"**

Tiles:
- Messages per active day (chat intensity)
- Stickiness: DAU/MAU ratio
- Sessions per week per user
- Integrations connected per user (Composio)

Red flag: stickiness < 20% (means users churn fast).

### Retention
Open with: **"Do they come back?"**

Tiles:
- D1, D7, D30 retention curves
- Retention cohorted by signup week
- Retention cohorted by first agent type chosen
- Retention cohorted by activation status (activated vs not)

Red flag: D7 retention < 30%.

### Feature Adoption
Open with: **"Which features are pulling weight? Which can we kill?"**

Tiles:
- Per-feature usage (last 30 days) with release annotations
- Feature adoption rate of features shipped in the last 90 days
- Correlation: feature use vs D30 retention

Red flag: a heavily-promoted feature has adoption < 5% of DAU after 30 days.

### Reliability (product POV)
Open with: **"How often do users see something broken?"**

Tiles:
- `app_error_shown` count by `error_kind`
- `session_failed` by provider
- Error rate per user per day
- Errors broken down by `app_version` (does the latest release have more errors than the previous?)

Red flag: error rate per user > 1.0 (means the average user sees more than one error per day).

Cross-reference with Sentry — PostHog tells you "users see errors at rate X" while Sentry tells you "the errors are these specific bugs."

### B2B (bonus)
Open with: **"Are there orgs adopting Houston as a team?"**

Tiles:
- Active users broken down by `email_domain`
- Multi-seat companies (domains with > 3 active users)
- Domain activation rate (% of users-per-domain who activated)

Red flag: a heavily-active domain (> 5 users) suddenly drops to 1-2 users — likely a champion left and the rollout's failing.

## Cohorts you should always have

Defined once in PostHog → reuse in every insight. From `knowledge-base/production-infra.md`:

- **Activated users** — fired `chat_message_received` (the activation milestone)
- **Stale-version users** — `app_version != latest`, for marketing-update emails to push people to update (improves Sentry symbolication coverage AND reduces bugs they hit)
- **B2B users** — `email_domain in [<your strategic accounts>]`
- **Power users** — top 10% by `total_messages_sent` (or `is_activated=true` if you haven't wired the counter yet)
- **Lost users** — `last_active_date > 30 days ago`

## How to read attribution

Two flavors of attribution:

1. **First-touch** (`$initial_utm_*` person properties) — the FIRST campaign that touched a user. "Which channel introduced them?"
2. **Last-touch** (`utm_*` event properties on `install_created`) — the campaign that CLOSED them. "Which channel converted them?"

For Houston, default to first-touch. It's the most defensible attribution model for a small team. Use last-touch when you specifically want to know "what closed the user" (e.g. a user heard about us 3 months ago on Twitter but only installed after seeing a YC Demo Day QR — last-touch credits YC, first-touch credits Twitter).

The IRL case from `growth/utm-conventions.md` works either way:
- Person scans QR at event → installs immediately → both first AND last touch credit the event
- Person doesn't have laptop, gets email follow-up → installs from email → first-touch credits IRL (because the email's `utm_campaign` matches), last-touch credits the follow-up email

Either way, the `utm_campaign` aggregates correctly across both paths.

## Red flags you should always investigate

In rough priority order:

1. **DAU drops > 15% day-over-day with no release** — something is broken or your auth flow is failing silently for a chunk of users
2. **Activation rate drops > 20% week-over-week** — onboarding got harder somehow
3. **`session_failed` count spikes on the day a new version goes live** — regression
4. **A previously-high-converting campaign suddenly converts 0** — broken UTMs, broken landing page, or a Sentry error blocking the install
5. **D7 retention falls for the LATEST signup cohort vs the previous one** — something we shipped is hurting new users specifically

## Things you should NOT do

- ❌ Look at every metric every day. Pick the ~5 that map to your current goal. The rest are noise until your goal changes.
- ❌ Switch the activation metric every time it dips. Pick once, stick for ≥ 90 days, judge the product against it.
- ❌ A/B test before you have baseline measurement. Phase 4 in `knowledge-base/production-infra.md`.
- ❌ Ship a campaign without filling in `growth/campaigns/<slug>.md` first. The 5 minutes you save is the 5 hours you'll waste 2 months later trying to remember what worked.
- ❌ Compare cohorts from BEFORE the event taxonomy change to cohorts AFTER. Apples to oranges; events have different shapes pre vs post.

## When you want to ask Claude / Cursor / etc to drive PostHog

The Merge Agent Handler has the full PostHog toolset (auth required — see `knowledge-base/production-infra.md`). Useful patterns:

- **"Give me yesterday's funnel drop-off"**: `merge execute-tool posthog__run_query` with a HogQL query against the funnel definition
- **"Make a new dashboard for <feature X>"**: `posthog__create_dashboard` + `posthog__create_insight`
- **"What's our weekly active user count by app version"**: `posthog__list_persons` filtered by `app_version` super property

If you find yourself doing the same query repeatedly, save it as a PostHog Insight + pin it to a dashboard. That's the durable version.

---

This doc is the operating manual. Read it once a quarter to remember what the rituals are. Update it when the rituals change.
