# UTM Conventions

Source of truth for every `?utm_*=` parameter we ship in a Houston link.

UTM naming is a one-way door. Once you have 6 months of analytics history with a given scheme, changing it costs you the ability to compare cohorts before and after. Lock this. If you want to change it later, talk to the team first.

## The four params we use

| Param | Required | Meaning | Format |
|---|---|---|---|
| `utm_source` | yes | The specific WHERE the click came from | `lowercase_snake_case` |
| `utm_medium` | yes | The TYPE of channel (coarse bucket) | `lowercase_snake_case` |
| `utm_campaign` | yes | The campaign slug | `lowercase_snake_case_with_year` |
| `utm_content` | when relevant | Variant inside the campaign (A/B, placement) | `lowercase_snake_case` |
| `utm_term` | DO NOT USE | Paid-search-keyword convention, irrelevant to us | — |

Rule of thumb: **campaign = the thing you're doing. medium = how it reached them. source = the specific where.**

## Vocabulary — pick from this list, don't invent

### `utm_source` — granular origin

- `email` — any email-tool send (Resend, Customer.io, manual)
- `twitter` / `linkedin` / `youtube` / `reddit` / `hackernews` / `producthunt` — social platforms
- `qr_code` — printed or on-screen QR
- `irl` — only when there's no QR involved (e.g. business card with the URL typed in)
- `referral_partner_<slug>` — explicit partnership (e.g. `referral_partner_yc`)
- `direct_share` — copied-link sharing we can't attribute further
- `blog` / `docs` / `changelog` — content on our own domain
- `paid_<network>` — ads (`paid_google`, `paid_meta`, `paid_reddit`)

### `utm_medium` — coarse channel bucket

- `email` (newsletters, broadcasts, transactional follow-ups)
- `email_followup` (post-IRL-event follow-up email — keep this distinct from regular email blasts)
- `social` (organic posts)
- `paid_ad` (any paid placement)
- `event` (in-person events — QR codes, business cards, swag handouts)
- `referral` (partnerships, link-trades)
- `organic` (SEO, content, direct typing)
- `share` (one user sent another user our link)

### `utm_campaign` — the thing you're doing

Format: `lowercase_snake_case_<year>` or `lowercase_snake_case_<yyyy_mm>` when there's a clear date scope.

Examples (don't invent variations — extend this list):
- `launch_v0_4_13` — a release announcement
- `yc_demo_day_2026` — a specific in-person event
- `paris_meetup_2026_01` — a specific local meetup
- `winter_2026_growth` — a multi-week growth push
- `producthunt_launch_2026` — a one-day flagship moment
- `notion_partnership_2026` — a co-marketing campaign

If your campaign is the SAME initiative across multiple channels (e.g. YC Demo Day = QR at event + follow-up email + social posts), use the SAME `utm_campaign` everywhere and let `utm_source` / `utm_medium` carry the channel difference. This is what enables the unified "everyone the event drove" cohort in PostHog.

### `utm_content` — A/B variants or placement

- `cta_header` / `cta_footer` / `cta_inline` — placement on a page
- `cta_a` / `cta_b` / `cta_c` — A/B/C test variants
- `qr_main` / `qr_lanyard` / `qr_poster` / `qr_table_tent` / `qr_business_card` — printed placement at an IRL event
- `email_<recipient_hash>` — when sending personalized links per recipient

## Example URLs

### Email blast for a release
```
https://gethouston.ai/?utm_source=email&utm_medium=email&utm_campaign=launch_v0_4_13&utm_content=cta_header
```

### QR at a YC Demo Day event
```
https://gethouston.ai/?utm_source=qr_code&utm_medium=event&utm_campaign=yc_demo_day_2026&utm_content=qr_table_tent
```

### Follow-up email to YC Demo Day attendees
```
https://gethouston.ai/?utm_source=email&utm_medium=email_followup&utm_campaign=yc_demo_day_2026&utm_content=irl_followup_24h
```

(Note: same `utm_campaign` as the QR — so the "everyone the event touched" cohort merges both groups.)

### Twitter post
```
https://gethouston.ai/?utm_source=twitter&utm_medium=social&utm_campaign=launch_v0_4_13
```

### Producthunt launch day
```
https://gethouston.ai/?utm_source=producthunt&utm_medium=referral&utm_campaign=producthunt_launch_2026
```

## Anti-patterns — do not do these

- ❌ Different casing across links (`utm_source=Email` vs `utm_source=email` — PostHog treats these as separate values)
- ❌ Spaces or URL-encoded names (`utm_campaign=YC%20Demo%20Day` — use snake_case)
- ❌ Adding the year inside a different param (`utm_source=event_2026` — year belongs in `utm_campaign`)
- ❌ Inventing a new `utm_medium` value for every campaign — keep it to the coarse buckets above
- ❌ Sending a link without UTMs because "it's just a quick share" — you can never recover this data later

## Per-event landing pages (the production-grade UX)

Generic UTM URLs work but look ugly on printed materials. Better: Cloudflare Worker routes that 302-redirect short, memorable URLs to UTM-laden ones.

- `gethouston.ai/yc-demo-day` → 302 → `?utm_source=qr_code&utm_medium=event&utm_campaign=yc_demo_day_2026&utm_content=qr_main`
- `gethouston.ai/launch` → 302 → `?utm_source=direct_share&utm_medium=share&utm_campaign=launch_v0_4_13`

Setup: see `houston-relay/` (CF Worker) — add route rules in the worker for new campaigns. ~10 LOC per campaign. The five minutes you spend per campaign compounds across all the people you send the link to.

## How this connects to the dashboards

PostHog auto-captures UTMs on the `$pageview` event when the website fires it. PostHog also sets `$initial_utm_*` as **person properties** — the FIRST campaign that touched a user. This is the right default for attribution: it captures who introduced the user, even if they came back via a different channel later.

For Houston specifically, since the install happens in the desktop app (not the website), we use a different bridge — see `growth/attribution-architecture.md` for the cookie-based handoff from website to app's `install_created` event.

## Adding a new vocabulary entry

If you genuinely need a new source/medium/campaign value:
1. Open a PR adding it to this file with the proposed value + the reasoning
2. Don't ship the campaign until the PR is merged — discipline > urgency

If everyone respects this, six months from now you'll be able to slice analytics by any campaign cleanly. If anyone doesn't, you'll be re-bucketing data forever.
