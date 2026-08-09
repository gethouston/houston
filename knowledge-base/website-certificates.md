# Website certificates — bootcamp participation certificates

Every attendee of a Houston workshop / bootcamp gets a shareable certificate: a
page at `gethouston.ai/c/<CODE>`, a printable PNG, a social card, and a one-click
"Add to LinkedIn profile". The **data lives in the `cloud` repo** (gateway +
Postgres); the **website is a pure renderer** that pulls a roster at build time
and pre-renders everything static.

**One credential noun, everywhere: participation / participación.** The printed
PNG, the page eyebrow, the OG title and description, the image alt and the
LinkedIn credential all make the same claim. The two halves of the vocabulary
live in `lib/certs/copy.mjs` (pixels) and
`src/certificates/certificates.11tydata.js` (HTML); change them together.

## File inventory

`website/lib/certs/` — the build-time toolchain:

| File | What it is |
|---|---|
| `config.mjs` | Env resolved once: `SITE_ORIGIN`, `CERTS_GATEWAY_URL`, `CERTS_EXPORT_TOKEN`, plus `certPageUrl(code)` |
| `fetch.mjs` | Transport ONLY: auth, pagination, module-level memo |
| `shape.mjs` | ALL derivation + ALL validation of the remote export |
| `format.mjs` | `formatEventDate` / `isoDateParts` |
| `image-cache.mjs` | Per-item render digest, renderer source fingerprint, manifest read/write |
| `font-coverage.mjs` | Parses the TTF `cmap` (formats 4 and 12) into a code-point set |
| `raster.mjs` | Font registration + satori → resvg |
| `render.mjs` | The `eleventy.after` render loop |
| `h.mjs` | `{type, props}` element helper (no JSX toolchain) |
| `logo.mjs` | Helmet as a base64 SVG data URL, parsed out of `src/_includes/houston-logo.njk` |
| `qr.mjs` | QR as a PNG data URL |
| `copy.mjs` | Copy baked into the PNGs, per language |
| `backdrop.mjs` | The photograph + the cover-crop maths |
| `panel.mjs` | The glass panel, the canvas root, `tint()` |
| `chrome.mjs` | Palette, type scale, primitives, issuer lockup |
| `citation.mjs` | Claim / name / event / date stack + the name size ladder |
| `attestation.mjs` | The verification foot: code + verify URL + QR under one rule |
| `template-cert.mjs` | The 2000×1414 printable certificate |
| `template-og.mjs` | The 1200×630 social card |
| `fonts/` | 6 TTFs + `LICENCE-GeneralSans.txt` + `OFL.txt` |
| `assets/space-bg.jpg` | The backdrop photograph both images are built on |

Elsewhere in `website/`:

- `src/_data/certificates.js` — the async global data file (calls `loadCertificates()`).
- `src/certificates/` — `index.njk` (entry claim), `event.njk` (per-event claim),
  `cert.njk` (share page), `verify/index.html`, `certificates.11tydata.js` (copy).
- `src/_includes/certificates/` — six includes: `claim-form.njk` (the card macro),
  `card-ui.njk` (DOM plumbing on `window.certCardUi`), `claim-wizard.njk` (the
  flow), `scripts.njk` (includes card-ui then wizard, in that order),
  `verify-scripts.njk`, `share-scripts.njk`.
- `src/assets/css/certificates.css`, and the `eleventy.after` hook in
  `website/eleventy.config.js`.

## Gateway contract (`cloud`: `internal/edge/certsroutes`, `internal/certs`)

Four endpoints on `https://gateway.gethouston.ai`. The group mounts OUTSIDE the
JWT wall — a certificate belongs to an event attendee, who is almost never a
signed-in Houston user — and is served on the L4-isolated listener
(`GW_AUTH_LISTEN_ADDR`, prod `:8082`), never the pod-facing `:8080` mux, because
the per-IP caps trust the rightmost `X-Forwarded-For`.

| Endpoint | Auth | Shape |
|---|---|---|
| `POST /v1/certs/claim` | public, 600/h per IP, CORS allowlist | body `{email, event_slug?}` (no slug = newest published event) → `200 {code, display_name, event{…}}`; every miss (unknown email, unknown slug, unpublished event) is the SAME `404 not_found`; `429` on cap |
| `POST /v1/certs/name` | public, **auth by knowledge**, 600/h per IP, CORS allowlist | body `{code, email, display_name}` → `200` with the updated certificate. The `(code, email)` pair IS the credential: both must resolve to the same attendee or nothing is written. Blank code or email = `400 invalid_request`; a name the store's `NormalizeDisplayName` refuses = `400`, never a 500; every other failure is the SAME `404 not_found` |
| `GET /v1/certs/{code}` | public, 1200/h per IP, `Access-Control-Allow-Origin: *` | → `200 {code, display_name, event{…}}`, `404 not_found`. Answers for **unpublished** events too: unpublishing hides an event from discovery, it must never invalidate a certificate someone already holds |
| `GET /v1/certs/export?limit=&offset=` | `Authorization: Bearer <CERTS_EXPORT_TOKEN>` (constant-time compare over SHA-256 digests; only REJECTED bearers spend a rate budget) | → `{events: [{slug,title,tagline,event_date,lang,location,cert_name,linkedin_org_id}], items: [{code,display_name,event_slug}]}`, published events only. Token unset on the gateway → `503 not_configured` (the endpoint is dark, never open) |

The caps are **sized for a room, not a person**: attendees claim from one venue
NAT in the minutes after a talk. `LimitName` is derived from `LimitClaim` rather
than picked — the name POST is step 2 of the same wizard from the same IP, so
anything tighter would 429 attendees who already claimed. It is deliberately
NOT capped per code: a code is public once its certificate is posted, so a
per-code budget would let a stranger lock its holder out of their own correction.

The claim and name POSTs are deliberately not wildcard-CORS'd (they are browser
fetches from our own site, riding `GW_CORS_ORIGINS`); only the verify GET is.

**No response carries an email, by construction** — the store's public
projections have no email field; an address is only ever a match input. That is
what makes a long-lived shared export token acceptable: the worst a leak yields
is the list of names already printed on public certificates.

Codes are `HOU-XXXXX-XXXXX` over a 30-symbol unambiguous alphabet (no I/L/O/U/0/1),
~49 bits.

## Build pipeline

```
CERTS_EXPORT_TOKEN ─┐
                    ├─> lib/certs/fetch.mjs  (memoized, module-level)
CERTS_GATEWAY_URL ──┘         │
                              ├─> src/_data/certificates.js  ──> Nunjucks pages (/c/, /certificates/**)
                              └─> eleventy.after hook        ──> lib/certs/render.mjs ──> _site/c/*.png
```

- **One fetch per build.** `loadCertificates()` memoizes a single promise, so the
  data file and the image renderer — same process — share one result instead of
  hitting the gateway twice. It walks `?limit=1000&offset=…` until a page comes
  back **empty**, advancing the offset by what actually arrived. A SHORT page is
  not the end: the gateway clamps `limit` to its own `RosterMaxLimit` and a proxy
  can cap it further, so stopping short would silently ship page 1 and 404 every
  attendee behind it. A `MAX_PAGES` guard (1000) keeps a misbehaving gateway from
  looping forever; it throws, which fails soft like any other fetch problem.
  Every request carries a 10s budget.
- **All derivation lives in `shape.mjs` and only there**: snake_case → camelCase,
  the item↔event join, `eventDateDisplay` (`lib/certs/format.mjs`, pinned `en-US`
  / `es-MX`, formatted in **UTC** — `new Date("2026-08-01")` is UTC midnight and
  would render as July 31 for anyone building west of Greenwich), and every URL
  (`pageUrl`, `imageUrl`, `ogImageUrl`). Templates and the renderer never rebuild
  a URL by hand. `ogImageUrl` is absolute (scrapers need a full URL); `imageUrl`
  is **root-relative on purpose** — it is the `<img>` and the `download` link, and
  `download` is ignored cross-origin, so an absolute URL would turn the primary
  action into "open production's image in a tab" on every non-prod host.
- **Never fails the build — and remote data cannot make it.** No token, gateway
  down, bad status, malformed JSON → `console.warn` +
  `{configured:false, events:[], items:[]}` and the rest of the site still ships.
  The token IS the switch (no `CERTS_ENABLED` boolean). `shape.mjs` sanitizes the
  export, because everything downstream assumes well-formed data:
  - an event whose **slug** is malformed or **reserved** is dropped (an event
    slugged `verify` would write to the same file as
    `src/certificates/verify/index.html` and abort the WHOLE site build with
    `DuplicatePermalinkOutputError`);
  - an event whose **`event_date`** is not exactly `YYYY-MM-DD` keeps its
    certificates but loses the date: `eventDate` blanks and the precomputed
    `issueYear` / `issueMonth` go null, so the LinkedIn link, the JSON-LD and the
    OG description all drop their date instead of throwing on a `.split`;
  - an item whose **code** does not match `^HOU-[0-9A-Z]{5}-[0-9A-Z]{5}$` is
    skipped — the code names `_site/c/<CODE>.png` and the share permalink, and
    `path.join` normalizes `..`, so a constraint in another repo is not a defense;
  - an item whose **display name** is not renderable (blank, >80 code points,
    control characters, bidi overrides, zero-width marks, no letter or digit) is
    skipped — it lands in `<title>`, OG tags, JSON-LD and the PNGs;
  - an item whose event is unpublished (or was just dropped) is skipped with a
    count, not rendered blank.
- **Images are written after the site**, by the `eleventy.after` hook into
  `_site/c/` — 4 at a time. A pair is skipped only when the files exist **and**
  the digest recorded in `website/.cache/certificate-images.json` still matches;
  the digest covers every field the templates read plus a fingerprint of every
  `.mjs`/`.ttf`/`.jpg`/`.png`/`.svg` under `lib/certs/`
  (`lib/certs/image-cache.mjs`). So `--serve` rebuilds stay instant, a corrected
  name re-renders exactly that certificate, and a template, font or artwork edit
  re-renders all of them with nobody bumping a version constant. The manifest
  lives OUTSIDE `_site` — that directory is the deploy artefact.
  `CERT_IMAGES=force` re-renders unconditionally. A certificate that fails to
  render warns and the build continues, and so does a failure to set the renderer
  up at all (missing font, unwritable dir) — the site never goes down for an
  image.

## URLs — why `/c/<CODE>.html` is a flat file

`cert.njk` paginates one page per item with `permalink: "/c/{{ cert.code }}.html"`,
**not** the usual `/c/<CODE>/index.html`. Both hosts we serve from resolve
`/c/<CODE>` to that exact file with ZERO redirects: Firebase Hosting has
`cleanUrls` on, Cloudflare Pages serves `.html` extensionless natively. A
directory permalink would make `/c/<CODE>` a 301 on Firebase, and every LinkedIn /
WhatsApp / X scraper that refuses to follow redirects would drop the Open Graph
card. `canonical` + `og:url` therefore point at the extension-less public URL,
never at `page.url`. Pages are `noindex` + excluded from collections — personal
artefacts, shareable by their owner, never a search result.

**Two headers make that real, in `website/firebase.json` AND `src/_headers`**
(Firebase and Cloudflare each read their own file — change both or the two hosts
disagree):

- `X-Robots-Tag: noindex, nofollow` on `/c/**`. `meta robots` covers the page but
  an image cannot carry a meta tag, and `/c/<CODE>.png` renders the attendee's
  full name as pixels — without the header, one LinkedIn share makes it findable
  in Google Images. (Social preview scrapers still fetch and render the card;
  `X-Robots-Tag` governs indexing, not fetching.)
- `Cache-Control: public, max-age=3600, must-revalidate` on `/c/*.png` —
  deliberately **not** `immutable`. These URLs are NOT content-addressed: a
  re-render (corrected name, template change) reuses the same URL, so a one-year
  immutable cache would pin a wrong name in every browser and scraper with no
  bust mechanism. If the images ever get a content hash in the filename, this can
  go back to a year.

The rest of the surface:

| URL | Template | What it is |
|---|---|---|
| `/certificates/` | `index.njk` | Entry claim wizard (English, event `<select>`) |
| `/certificates/<slug>/` | `event.njk` | Per-event claim wizard, rendered wholly in the EVENT's language. `<slug>` is remote data — see the reserved-slug rule above |
| `/certificates/verify/` | `verify/index.html` | Live check against `GET /v1/certs/{code}`; accepts `?code=` prefill |
| `/c/<CODE>` | `cert.njk` | The share page: image, name, event, code, share row |
| `/c/<CODE>.png`, `/c/<CODE>.og.png` | `eleventy.after` | The two rendered images |

## The claim wizard — three steps in one card

`claim-form.njk` renders ONE card for both claim surfaces; the only difference is
how the event slug is supplied (`lockedSlug` on an event page, a `<select>` — or
a hidden input when exactly one event is published — on the entry page). The card
holds three panes, swapped client-side by `claim-wizard.njk`, no reload:

1. **Email** (+ event when there is a choice) → `POST /v1/certs/claim`. On `200`
   the response's `display_name` prefills step 2 and a HEAD probe of `/c/<CODE>`
   starts in the background.
2. **Name** — "is this your name?", prefilled, `maxlength=80`. Unchanged → no
   request. Changed → `POST /v1/certs/name` with `{code, email, display_name}`.
   A Back button returns to step 1.
3. **Done** — the code, a link to the certificate, the share hint. When the name
   was rewritten, a success message says the image is regenerating (otherwise the
   attendee opens the link, sees the old name and thinks it failed).

- **Progressive enhancement.** Step 1 is the markup default; steps 2 and 3 ship
  `hidden` with their buttons `disabled`, and `show()` disables every off-screen
  step's button, so neither Tab nor implicit submission can reach one. With no JS
  the card is exactly the plain email form it has always been.
- **The email lives ONLY in the wizard's closure** — never the URL, storage, a
  `data-*` attribute or the console. The name POST is the only thing that reads
  it.
- **The HEAD probe.** An attendee imported after the last deploy has no static
  page yet: navigating blind would drop them on the generic 404, so when the
  probe fails the Done link becomes `/certificates/verify/?code=…`, which
  resolves the code live from the gateway. The probe is fired at claim time and
  carries a `probeId`, so a second claim cannot be overtaken by the first's
  answer.
- **The script holds no copy.** Every string rides on a `data-*` attribute of the
  form, so en and es share one script.

`src/404.html` backs that up: a 404 under `/c/` first retries the URL in the
canonical uppercase (codes get pasted lowercase; `/c/` is case-sensitive on both
hosts), and if the code is well formed but has no page, it rewrites itself into a
"verify this certificate" page instead of the generic links. **The retry needs no
loop guard** — the retry URL is already uppercase, so a second pass falls through.
Never add a `sessionStorage` guard here: it dead-ends every repeat visit to a
working lowercase link on the 404.

## Images (satori → resvg)

`lib/certs/raster.mjs`: satori turns an element tree into SVG, resvg turns SVG
into PNG. Templates are plain `{type, props}` objects via `lib/certs/h.mjs` — the
site has no bundler and no JSX toolchain, and we are not adding one for two
build-time images.

**Both images are the same photograph, full-bleed, with ONE translucent glass
panel over it carrying every word.**

- **Backdrop** (`backdrop.mjs`) — `assets/space-bg.jpg`, read and base64'd once
  per build. `objectFit` gives no control over which part of an off-ratio canvas
  survives, and this shot has a subject that must survive (the sunrise on the
  horizon), so the cover crop is computed here from the JPEG's own frame header
  and applied as an oversized absolutely-positioned `<img>` inside an
  `overflow:hidden` root. Over it goes a faint vignette and nothing more —
  contrast is the panel's job.
- **Panel** (`panel.mjs`) — satori has no `backdrop-filter`, so the glass is made
  of exactly two things: a vertical alpha ramp in the photograph's own darkest
  navy (`#040c1e`, not black, so it darkens rather than desaturates), and a
  single warm-white hairline edge (`rgba(250,249,245,0.18)`) that tells the eye a
  pane is there. The ramp is deepest at top and bottom and thins through the
  middle, where the sunrise comes through. `overflow:hidden` so a long line can
  never spill past the rounded corner.
- **Chrome** (`chrome.mjs`) — the shared palette (warm white `#faf9f5`, never pure
  `#fff`), the four type roles transposed from the landing's CSS
  (display/eyebrow/body/code, with `WEIGHT`, `TRACK` and `LEADING` tables), the
  `text` / `centred` / `rule` / `eyebrow` primitives, and the issuer `lockup`:
  the helmet with the SITE's wordmark to its right (title case, General Sans 500,
  -0.02em — `.lnav-brand` verbatim) and `gethouston.ai` under it.

| Image | Size | Composition |
|---|---|---|
| `<CODE>.png` | 2000×1414 (A4/letter landscape at ~170dpi) | 96px of photograph on all four sides of the panel. Inside, centred, three blocks with flex-grown air between them: the **letterhead** (lockup at 116px helmet / 56px wordmark, "CERTIFICATE OF PARTICIPATION" as a tracked eyebrow under it), the **citation** (`citation.mjs` — "This certifies that", the name at a stepped size ladder by code-point count so a cohort reads as one document, "for participating in", the event title, an optional tagline, and a rule-flanked date), and the **verification foot** (`attestation.mjs` — a full-measure hairline, then the code + `Verify at gethouston.ai/certificates/verify` on the left against a white QR chip on the right, centred against each other, not baselined). Nothing shrinks: `flexShrink: 0` everywhere, so an impossible certificate overruns the bottom padding instead of drawing over the letterhead |
| `<CODE>.og.png` | 1200×630 | Deliberately NOT a shrunken certificate — at feed size a document reads as grey noise. Same photograph, same panel language, 40px inset, a lighter tint ramp, everything left-aligned at feed scale: lockup left with `date · code` right, then a centred block holding the outlined "CERTIFICATE OF PARTICIPATION" pill, the name (the printed ladder at ~0.58x) and the event title |

Fonts, and the traps around them:

- **Six static TTFs, vendored at `lib/certs/fonts/`.** satori reads TTF/OTF/WOFF
  and NOT the woff2 the browser gets, so the faces ship as `.ttf`
  (`LICENCE-GeneralSans.txt` records the exact Fontshare URLs).
  **`BRAND_FONT` = General Sans at 400 / 500 / 600 / 700** — Houston's typeface,
  the same face `.lnav-brand` sets the wordmark in on every page, and the family
  both canvases declare.
  **`FALLBACK_FONT` = Hanken Grotesk at 400 / 600, which draws nothing by
  design**: it is registered behind General Sans purely to catch the ~190 code
  points General Sans lacks (Vietnamese, mostly), because satori falls through
  the `fonts` array for a glyph the first family cannot draw.
- satori embeds glyphs as paths, so resvg needs no system fonts and the output is
  byte-identical on macOS and on the `ubuntu-latest` runner. Changing the site's
  webfont does not change the certificates — update both.
- **The bundle is Latin only, and satori says nothing about it.** A code point no
  registered font carries is drawn as `.notdef` — an empty box — with no warning
  and no failure, on a permanent public credential. `lib/certs/font-coverage.mjs`
  parses each TTF's `cmap` (formats 4 and 12) and `raster.mjs` unions the
  coverage across ALL six files, so `render.mjs` can name the offending
  characters at build time: `the bundled fonts cannot draw 李 明 …`. It warns, it
  does not block. **If a cohort has non-Latin names, add a font that covers the
  script** — the warning is the trigger, not a nuisance to silence.
- **satori implements a SUBSET of flexbox and has no block layout**: every node
  with more than one child declares `display:"flex"` + an explicit
  `flexDirection`; spacing is explicit margins, never collapse.
- **Two tracking quirks, both compensated in the templates.** satori adds
  `letterSpacing` after the LAST glyph too, so a centred tracked line lands half a
  step left of the true axis (`centred()` in `chrome.mjs` adds a compensating
  `marginLeft`, and `lockup({centred:true})` does the same for the mark as a
  whole); the OG pill's right padding is 6px short for the same reason.
- **No inline `<svg>` children.** The helmet ships as a base64 SVG data URL
  (`lib/certs/logo.mjs`, parsed out of `src/_includes/houston-logo.njk` so the
  mark can never drift from the site), the QR as a PNG data URL
  (`lib/certs/qr.mjs`, 480px source, EC level M, drawn at 176px inside a white
  26px-padded chip — that padding is the spec's four-module quiet zone, not
  decoration).

Copy baked into the PNGs (both languages) lives in `lib/certs/copy.mjs`, keyed
off the event's `lang`; unknown languages fall back to English.

## Share, LinkedIn, and structured data

`cert.njk` owns:

- **Add to profile** — `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=<certName|eventTitle>&organizationId=<linkedinOrgId>&issueYear=&issueMonth=&certUrl=<pageUrl>&certId=<code>`.
  `organizationId` binds the credential to Houston's real company page;
  `organizationName=Houston` is the fallback while an event has no org id. Every
  interpolated value is `urlencode`d — the org id is remote admin data, and an
  unencoded `&` or `=` would inject extra LinkedIn parameters.
  **`certUrl` stays CLEAN (no UTMs)** — it is stored on the profile forever as
  the credential's URL, not as a campaign click.
- **Share row** — LinkedIn / X / WhatsApp / copy-link, each with UTMs per
  `growth/utm-conventions.md`: `utm_campaign=cert_share_2026` throughout;
  `utm_medium=social` for a public post (`utm_source=linkedin|twitter`),
  `utm_medium=share&utm_source=direct_share` for person-to-person with
  `utm_content=whatsapp|copy_link`. The copy-link button
  (`share-scripts.njk`) is the page's only interactive element — everything else
  is a plain link so a shared certificate works with JS off — and it falls back
  to a selection-based copy where the async clipboard API is missing.
- **Per-certificate social card** — the page replaces `base.njk`'s default
  `socialImage` block entirely with the attendee's own 1200×630 image.
  `issueYear` / `issueMonth` come from the precomputed fields and are **omitted
  entirely** when the event has no usable date; LinkedIn accepts the form without
  them.
- **`EducationalOccupationalCredential` JSON-LD** — name, identifier, url,
  dateCreated, `about` Event, `recognizedBy` Houston. Values go through a `dump`
  + `<`-escaping macro so a name or title can never close the script element.
  `dateCreated` / `startDate` are omitted rather than emitted empty.
- **Download** — `download="houston-certificate-<CODE>.png"` straight off the
  static PNG.

## Copy and languages

`src/certificates/certificates.11tydata.js` holds the en + es dictionary for all
four page types in ONE place, plus `certSupportEmail`. It is a **directory data
file**, not a Nunjucks `{% set %}`, because the templates cannot share a scope
(share pages render per-certificate in the attendee's language, event pages in
the event's language, entry + verify in English), Nunjucks `include` does not
export `set` variables, and a macro can only return markup. `{event}` / `{name}`
/ `{date}` placeholders are substituted with the `replace` filter, never
concatenated, so word order stays translatable.

## Two traps in the claim / verify scripts

Both hit `src/_includes/certificates/card-ui.njk` (the claim card's plumbing,
consumed by `claim-wizard.njk`) and `src/_includes/certificates/verify-scripts.njk`,
and both are easy to silently undo.

- **Un-hide the live region BEFORE filling it.** `#certClaimMsg` /
  `#certNameMsg` / `#certDoneMsg` / `#certVerifyMsg` are `role="status"
  aria-live="polite"`, and a live region only announces content *inserted while
  it is already in the accessibility tree*. Writing text into it while it is
  still `hidden` (`display:none`) and un-hiding afterwards is silent in NVDA,
  JAWS and VoiceOver. So: clear, un-hide empty, then append on a `setTimeout`
  (**not** `requestAnimationFrame`, which does not run in a background tab).
  Messages are built from DOM nodes, never `innerHTML` — no page copy or API
  value is ever parsed as markup.
- **Every `fetch` carries a budget.** `AbortSignal.timeout(…)` via the local
  `budget()` helper, which degrades to no signal on browsers without it rather
  than throwing on the way into `fetch`. Without one, a gateway that accepts the
  socket and never answers leaves the button disabled and spinning forever — the
  single failure mode with no message. `AbortError` lands in the existing catch
  and reads as a network failure, which is what it is to the visitor. Budgets:
  15s for claim and name, 8s for the `/c/<CODE>` HEAD probe.

The verify page also anchors the code it accepts: a **typed** code must match
`^HOU-[A-Z0-9]{5}-[A-Z0-9]{5}$` end to end, and only a pasted URL is searched for
a code inside it (`/\/C\/(HOU-[A-Z0-9]{5}-[A-Z0-9]{5})(?:[./?#]|$)/`). An
unanchored search made `HOU-ABCDE-FGHIJK` verify as `HOU-ABCDE-FGHIJ` — a green
check and a stranger's name for a code nobody typed.

## Operator ritual — running a new event

Two steps, in this order, and the second one is the one people forget.

1. **In the `cloud` repo** — create the event and import the attendee CSV
   (`name,email`, header optional):
   ```bash
   make certs-import-plan EVENT=demo-day CSV=./attendees.csv    # dry run, writes nothing
   make certs-import      EVENT=demo-day CSV=./attendees.csv \
     CREATE_EVENT=1 TITLE="Demo Day" DATE=2026-12-31 LANG=es
   ```
   Idempotent by email (case-insensitive): re-running the same or a grown list
   never mints a second code. Optional with `CREATE_EVENT=1`: `TAGLINE`,
   `LOCATION`, `CERT_NAME`, `LINKEDIN_ORG_ID`. Events are created **published**;
   an existing event is never edited by an import. Details:
   `cloud/cmd/certs-import/main.go`.
2. **Rebuild the website** — codes minted in the DB are invisible until the site
   is rebuilt, and a DB-only import touches no `website/**` path, so the deploy
   workflow's path filter never fires. Dispatch it by hand:
   ```bash
   gh -R gethouston/houston workflow run website-deploy.yml --ref main
   ```
   (The import command prints this line on success.)

Hand attendees `gethouston.ai/certificates/<slug>/` — the claim page in their own
language. A CSV whose names were cased wrong is not a re-import: attendees fix
their own name at step 2 of the wizard.

## Privacy posture

Attendee **emails never enter this repo and never enter the built site**. They
live only in the gateway's Postgres and in the operator's local CSV (never
committed). The export projection has no email field, the claim and name
endpoints use an address purely as a match input and never log it, and every miss
is indistinguishable so neither endpoint can enumerate an attendee list, reveal
an unpublished event, or confirm which address owns a code.

Three rules keep that true in the browser, and each of them has already been
broken once:

- **No control in the claim form carries a `name` attribute.** The form has no
  `action` and no `method`, so if the script never attaches (JS off, inline
  script blocked, script error) the browser falls back to a GET at that very URL
  — and a named email field would put the attendee's address into the address
  bar, the history, the Firebase access log and, once JS is merely *late* rather
  than absent, into the PostHog `$current_url` and the GA4 `page_location`.
  Autofill runs off `autocomplete`, the script reads by `id`; names buy nothing.
- **`/c/*` pages do not report their real title or URL to analytics.** The
  `<title>` is the attendee's real name and the path is their code. `cert.njk`
  sets `analyticsTitle` + `analyticsPath` in its front matter; `base.njk` then
  turns PostHog's automatic capture off and sends its own `$pageview`, and passes
  `page_title` / `page_location` to `gtag('config', …)`. The **query string is
  kept**, so a shared link's UTMs still attribute. Any other page that puts
  personal data in its title gets the same two keys — pages without them render
  byte-for-byte as before.
- **Gateway payloads are never echoed into the console.** `ui.warn` logs the
  status plus an allowlisted `^[a-z0-9_]{1,64}$` error code, never `r.json`: the
  site cannot constrain what the gateway puts in an error body, and
  `{"error":"invalid_email","email":"…"}` is an ordinary API shape.
