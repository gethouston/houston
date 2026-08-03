# Website certificates — bootcamp completion certificates (August 2026)

Every attendee of a Houston workshop / bootcamp gets a shareable certificate:
a page at `gethouston.ai/c/<CODE>`, a printable PNG, a social card, and a
one-click "Add to LinkedIn profile". The **data lives in the `cloud` repo**
(gateway + Postgres); the **website is a pure renderer** that pulls a roster at
build time and pre-renders everything static.

Files: `website/lib/certs/*.mjs` — `fetch.mjs` (transport: auth, pagination,
memo), `shape.mjs` (all derivation + all validation of the remote export),
`format.mjs`, `image-cache.mjs` (render digests), `font-coverage.mjs`, and the
image toolchain (`render`, `raster`, `template-cert`, `template-og`, `h`, `logo`,
`qr`, `copy`, `config`) — plus `website/src/_data/certificates.js`
(global data), `website/src/certificates/` (claim / event / verify / share templates),
`website/src/_includes/certificates/` (form macro + the three client scripts:
`scripts` = claim, `verify-scripts` = verify, `share-scripts` = copy link),
`website/src/assets/css/certificates.css`, and the `eleventy.after` hook in
`website/eleventy.config.js`.

## Gateway contract (`cloud`: `internal/edge/certsroutes`, `internal/certs`)

Three endpoints on `https://gateway.gethouston.ai`. The group mounts OUTSIDE the
JWT wall — a certificate belongs to an event attendee, who is almost never a
signed-in Houston user.

| Endpoint | Auth | Shape |
|---|---|---|
| `POST /v1/certs/claim` | public, 30/h per IP, CORS allowlist | body `{email, event_slug?}` (no slug = newest published event) → `200 {code, display_name, event{…}}`; every miss (unknown email, unknown slug, unpublished event) is the SAME `404 not_found`; `429` on cap |
| `GET /v1/certs/{code}` | public, 120/h per IP, `Access-Control-Allow-Origin: *` | → `200 {code, display_name, event{…}}`, `404 not_found`. Answers for **unpublished** events too: unpublishing hides an event from discovery, it must never invalidate a certificate someone already holds |
| `GET /v1/certs/export?limit=&offset=` | `Authorization: Bearer <CERTS_EXPORT_TOKEN>` (constant-time compare) | → `{events: [{slug,title,tagline,event_date,lang,location,cert_name,linkedin_org_id}], items: [{code,display_name,event_slug}]}`, published events only. Token unset on the gateway → `503 not_configured` (the endpoint is dark, never open) |

**No response carries an email, by construction** — the store's public
projections have no email field; an address is only ever a claim's match input.
That is what makes a long-lived shared export token acceptable: the worst a leak
yields is the list of names already printed on public certificates.

Codes are `HOU-XXXXX-XXXXX` over a 30-symbol unambiguous alphabet (no I/L/O/U/0/1),
~49 bits — unguessable at 120/h.

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
  attendee behind it. A `MAX_PAGES` guard keeps a misbehaving gateway from
  looping forever (it throws, which fails soft like any other fetch problem).
- **All derivation lives in `fetch.mjs` and only there**: snake_case → camelCase,
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
  The token IS the switch (no `CERTS_ENABLED` boolean). The loader is also the
  place that sanitizes the export, because everything downstream of it assumes
  well-formed data:
  - an event whose **slug** is malformed or **reserved** is dropped (an event
    slugged `verify` would write to the same file as
    `src/certificates/verify/index.html` and abort the WHOLE site build with
    `DuplicatePermalinkOutputError`);
  - an event whose **`event_date`** is not exactly `YYYY-MM-DD` keeps its
    certificates but loses the date: `eventDate` blanks and the precomputed
    `issueYear` / `issueMonth` go null, so the LinkedIn link, the JSON-LD and the
    OG description all drop their date instead of throwing on a `.split`;
  - an item whose event is unpublished (or was just dropped) is skipped with a
    count, not rendered blank.
- **Images are written after the site**, by the `eleventy.after` hook into
  `_site/c/` — 4 at a time. A pair is skipped only when the files exist **and**
  the digest recorded in `website/.cache/certificate-images.json` still matches;
  the digest covers every field the templates read plus a fingerprint of the
  renderer's own source (`lib/certs/image-cache.mjs`). So `--serve` rebuilds stay
  instant, a corrected name re-renders exactly that certificate, and a template
  or font edit re-renders all of them with nobody bumping a version constant.
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
| `/certificates/` | `index.njk` | Entry claim form (English, event `<select>`) |
| `/certificates/<slug>/` | `event.njk` | Per-event claim page, rendered wholly in the EVENT's language. `<slug>` is remote data — see the reserved-slug rule above |
| `/certificates/verify/` | `verify/index.html` | Live check against `GET /v1/certs/{code}`; accepts `?code=` prefill |
| `/c/<CODE>` | `cert.njk` | The share page: image, name, event, code, share row |
| `/c/<CODE>.png`, `/c/<CODE>.og.png` | `eleventy.after` | The two rendered images |

Claim → `found()` shows the code, HEAD-probes `/c/<CODE>`, and only then hops.
An attendee imported after the last deploy has no static page yet: navigating
blind would drop them on the generic 404, so when the probe fails the visitor
stays put and the button turns into a `/certificates/verify/?code=…` link, which
resolves the code live from the gateway. The code is shown **before** any of
this, so the trip is never wasted either way.

`src/404.html` backs that up: a 404 under `/c/` first retries the URL in the
canonical uppercase (codes get pasted lowercase; `/c/` is case-sensitive on both
hosts), and if the code is well formed but has no page, it rewrites itself into a
"verify this certificate" page instead of the generic links. **The retry needs no
loop guard** — the retry URL is already uppercase, so a second pass falls through.
A `sessionStorage` flag used to sit there and made every *repeat* visit to a
working lowercase link dead-end on the 404; don't add one back.

## Images (satori → resvg)

`lib/certs/raster.mjs`: satori turns an element tree into SVG, resvg turns SVG
into PNG. Templates are plain `{type, props}` objects via `lib/certs/h.mjs` — the
site has no bundler and no JSX toolchain, and we are not adding one for two
build-time images.

- **The font trap.** satori CANNOT read the site's variable woff2
  (`src/assets/fonts/hanken-grotesk-latin.woff2`). The three weights ship as
  **static TTF instances** cut from the upstream variable font with fonttools,
  vendored at `lib/certs/fonts/` (300 / 400 / 600 + `OFL.txt`). satori embeds
  glyphs as paths, so resvg needs no system fonts and the output is byte-identical
  on macOS and on the `ubuntu-latest` runner. Changing the site's webfont does not
  change the certificates — update both.
- **The fonts are Latin ONLY, and satori says nothing about it.** A code point the
  fonts do not carry is drawn as `.notdef` — an empty box — with no warning and no
  failure, on a permanent public credential. `lib/certs/font-coverage.mjs` parses
  the TTF `cmap` (formats 4 and 12) so `render.mjs` can name the offending
  characters at build time: `the bundled fonts cannot draw 李 明 …`. It warns, it
  does not block. **If a cohort has non-Latin names, add a font that covers the
  script** — the warning is the trigger, not a nuisance to silence.
- **satori implements a SUBSET of flexbox and has no block layout**: every node
  with more than one child declares `display:"flex"` + an explicit
  `flexDirection`; spacing is explicit margins, never collapse.
- **Two tracking quirks, both compensated in the templates.** satori adds
  `letterSpacing` after the LAST glyph too, so a centred tracked line lands half a
  step left of the true axis (`text()` in `template-cert.mjs` adds a compensating
  `marginLeft`); the OG pill's right padding is 9px short for the same reason.
- **No inline `<svg>` children.** The helmet ships as a base64 SVG data URL
  (`lib/certs/logo.mjs`, parsed out of `src/_includes/houston-logo.njk` so the
  mark can never drift from the site), the QR as a PNG data URL
  (`lib/certs/qr.mjs`, 480px, EC level M, drawn at 200px).

| Image | Size | Design |
|---|---|---|
| `<CODE>.png` | 2000×1414 (A4/letter landscape at ~170dpi) | White ground, hairline frame, one solid black bar at the frame's top. Helmet + HOUSTON wordmark, "CERTIFICATE OF COMPLETION", the name (stepped size ladder by code-point count — every certificate in a cohort reads as the same document), the event title + optional tagline, the date. Footer = three equal columns: issuer / code + verify URL / QR, so the code sits on the document's true optical centre |
| `<CODE>.og.png` | 1200×630 | Deliberately NOT a shrunken certificate — at feed size a document reads as grey noise. Houston's black ground, wordmark, outlined claim pill, the name, the event, and `date · code` |

Baked copy (both languages) lives in `lib/certs/copy.mjs`, keyed off the event's
`lang`; unknown languages fall back to English.

**One credential noun, everywhere: completion / finalización.** The printed PNG
(`copy.mjs`), the page eyebrow, the OG title and description, the image alt and
the LinkedIn credential must all make the same claim — participation and
completion are materially different credentials, and the artefact once said
"participation" while the page around it said "completion". The two halves of the
vocabulary live in `lib/certs/copy.mjs` (pixels) and
`src/certificates/certificates.11tydata.js` (HTML); change them together.

## Share, LinkedIn, and structured data

`cert.njk` owns:

- **Add to profile** — `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=<certName|eventTitle>&organizationId=<linkedinOrgId>&issueYear=&issueMonth=&certUrl=<pageUrl>&certId=<code>`.
  `organizationId` binds the credential to Houston's real company page;
  `organizationName=Houston` is the fallback while an event has no org id.
  **`certUrl` stays CLEAN (no UTMs)** — it is stored on the profile forever as
  the credential's URL, not as a campaign click.
- **Share row** — LinkedIn / X / WhatsApp / copy-link, each with UTMs per
  `growth/utm-conventions.md`: `utm_campaign=cert_share_2026` throughout;
  `utm_medium=social` for a public post (`utm_source=linkedin|twitter`),
  `utm_medium=share&utm_source=direct_share` for person-to-person with
  `utm_content=whatsapp|copy_link`.
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
four page types in ONE place — a **directory data file**, not a Nunjucks `{% set %}`,
because the templates cannot share a scope (share pages render per-certificate in
the attendee's language, event pages in the event's language, entry + verify in
English). `{event}` / `{name}` / `{date}` placeholders are substituted with the
`replace` filter, never concatenated, so word order stays translatable.

## Two traps in the claim / verify scripts

Both scripts (`src/_includes/certificates/scripts.njk`, the inline one in
`verify/index.html`) hit the same two, and both are easy to silently undo.

- **Un-hide the live region BEFORE filling it.** `#certClaimMsg` / `#certVerifyMsg`
  are `role="status" aria-live="polite"`, and a live region only announces content
  *inserted while it is already in the accessibility tree*. Writing text into it
  while it is still `hidden` (`display:none`) and un-hiding afterwards is silent
  in NVDA, JAWS and VoiceOver — every outcome the feature is proud of surfacing
  would be visually loud and aurally nothing. So: clear, un-hide empty, then
  append on a `setTimeout` (**not** `requestAnimationFrame`, which does not run in
  a background tab).
- **Every `fetch` carries a budget.** `AbortSignal.timeout(…)` via the local
  `budget()` helper, which degrades to no signal on browsers without it rather
  than throwing on the way into `fetch`. Without one, a gateway that accepts the
  socket and never answers leaves the button disabled and spinning forever — the
  single failure mode with no message. `AbortError` lands in the existing catch
  and reads as a network failure, which is what it is to the visitor.

The verify page also anchors the code it accepts: a **typed** code must match
`^HOU-[A-Z0-9]{5}-[A-Z0-9]{5}$` end to end, and only a pasted URL is searched for
a code inside it. An unanchored search made `HOU-ABCDE-FGHIJK` verify as
`HOU-ABCDE-FGHIJ` — a green check and a stranger's name for a code nobody typed.

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
language.

## Privacy posture

Attendee **emails never enter this repo and never enter the built site**. They
live only in the gateway's Postgres and in the operator's local CSV (never
committed). The export projection has no email field, the claim endpoint uses an
address purely as a match input and never logs it, and every miss is
indistinguishable so the endpoint cannot enumerate an attendee list or reveal an
unpublished event.

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
- **Gateway payloads are never echoed into the console.** Both scripts log the
  status plus an allowlisted `^[a-z0-9_]+$` error code, never `r.json`: the site
  cannot constrain what the gateway puts in an error body, and
  `{"error":"invalid_email","email":"…"}` is an ordinary API shape.
