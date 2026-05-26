# Campaign: `<utm_campaign slug>`

Copy this template for each new campaign. Keep it short — this is a working
document, not a deck. The goal is to make the campaign's hypothesis and
result easy to find later.

## What

One sentence: what are we doing?

## When

- Start: `YYYY-MM-DD`
- End: `YYYY-MM-DD` (or "ongoing")

## utm_campaign

Slug used in all links: `utm_campaign=<slug>` (see `growth/utm-conventions.md`).

## Channels + variants

List every (`utm_source`, `utm_medium`, `utm_content`) combination shipped. One per row.

| utm_source | utm_medium | utm_content | Where |
|---|---|---|---|
| `qr_code` | `event` | `qr_main` | Table tent at booth |
| `qr_code` | `event` | `qr_lanyard` | Conference lanyards |
| `email` | `email_followup` | `irl_followup_24h` | 24h-after-event follow-up email |

## Hypothesis

What we expect to happen, with a target. Be specific, be falsifiable.

- "We'll see ≥100 installs attributed to this campaign in the first week"
- "Activation rate (chat_message_received within 24h) for this cohort will be ≥ baseline"

If you can't write a falsifiable target, the campaign isn't ready.

## Budget

- Money: `$X` (event tickets, ad spend, swag, anything)
- Time: rough person-hours

## How we'll measure

Link the PostHog cohort/funnel/insight that will show whether this worked. Standard pattern:

- **Cohort:** persons with `$initial_utm_campaign = <slug>`
- **Funnel:** install → activation, filtered by that cohort
- **Comparison:** vs baseline (cohort: persons with no `$initial_utm_campaign`)

## Result

Filled in 2 weeks after launch. Be honest.

- Installs attributed: `N`
- Activated: `N` (`X%`)
- Cost per activated user: `$Y / N = $Z`
- Compared to baseline: `+X%` / `-X%` / `same`
- What did we learn?
- Would we do this again? Why / why not?

---

Why we bother with this doc: the alternative is "we did YC Demo Day and it
felt good." That's not a growth strategy. Write the hypothesis down, ship
the campaign, come back and grade it. The discipline is what makes the data
actionable.
