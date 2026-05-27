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

Generic UTM URLs are ugly on printed materials. Use `website/src/_redirects` — Cloudflare Pages reads it on every deploy and 302-redirects short URLs to UTM-laden ones.

Pattern (one line per campaign):
```
/yc-demo-day-2026   /?utm_source=qr_code&utm_medium=event&utm_campaign=yc_demo_day_2026&utm_content=qr_table_tent   302
```

Add a line per IRL event / printed asset. Keep the slug short and human-printable — that's what goes on QR codes and posters. The 5 minutes of setup compound across every person you send the link to.

## How attribution flows end-to-end (the bridge)

Here's the actual machinery that connects a QR scan at an IRL event to an `install_created` event in PostHog, with the campaign attached:

1. **Person scans the QR** at the event → lands on `gethouston.ai/yc-demo-day-2026` (the short slug)
2. **Cloudflare Pages reads `_redirects`** → 302 to `gethouston.ai/?utm_*` with the full UTM params
3. **PostHog snippet on the landing page** captures the `$pageview` event with the UTMs, AND sets `$initial_utm_source/_medium/_campaign/_content` as **person properties** on the website's anonymous person profile. `person_profiles: 'always'` in `base.njk` is what makes anonymous profiles exist (otherwise they'd be deferred until identify, and the UTMs would be lost).
4. **Person clicks Download** → the website tracks `download_clicked` with the UTMs as event props
5. **Person installs Houston, opens it for the first time**
6. **Houston desktop app, on first launch only** (`isNew=true` from the install_id cache in `app/src/lib/install-id.ts`): opens `https://gethouston.ai/welcome?install_id=<id>` in the user's default browser via `tauriSystem.openUrl`
7. **The `/welcome` page** (in `website/src/welcome/index.html`) reads `?install_id=`, calls `posthog.alias(install_id)` + `posthog.identify(install_id, …)`. This MERGES the website's anonymous person — already carrying `$initial_utm_*` from step 3 — into the app's install_id.
8. **From now on**, every event the app fires (chat_message_sent, agent_created, etc.) is associated with that install_id, which carries the original `$initial_utm_*`. Cohort filters on `$initial_utm_campaign = yc_demo_day_2026` now span both website AND app events.

**Failure modes** (when attribution doesn't flow):
- User clears cookies between the landing page visit and the install → website's anonymous person is gone before identity merge → loses UTMs
- User has Do Not Track on → `respect_dnt: true` in `base.njk` means PostHog doesn't fire → no website-person to merge with
- App's `openUrl` fails (no default browser configured) → `/welcome` never loads → no merge happens
- User closes the welcome tab before PostHog's script identifies (race window ~200ms)

Expected attribution coverage: ~70-85% of installs that came from a tracked campaign. Use this as a known coverage gap when computing cost-per-attributed-install.

## Adding a new vocabulary entry

If you genuinely need a new source/medium/campaign value:
1. Open a PR adding it to this file with the proposed value + the reasoning
2. Don't ship the campaign until the PR is merged — discipline > urgency

If everyone respects this, six months from now you'll be able to slice analytics by any campaign cleanly. If anyone doesn't, you'll be re-bucketing data forever.
