# Website: design decisions

Covers `website/`: the Eleventy marketing site, its translations, pricing data, analytics, certificates and build-time data.

## Translations and copy rules

`src/_data/i18n/en.js` is the source of the key tree; es and pt mirror it exactly (same paths, array lengths and leaf types), enforced by `scripts/check-locales.mjs`, which also bans em dashes. Page-specific trees (`enterprise`, `dataPartners`, `refer`, `referBoard`, `referListings`) are separate files listed in `lib/page-trees.js` and joined onto the locale tree by `_data/eleventyComputed.js` rather than imported, because Eleventy reloads a data file on save but not a module it imports, so an import serves stale copy in dev. Keys ending in `Html` may contain markup and render with `| safe`; everything else is escaped. `{price}`, `{yearlyPrice}` and `{yearlyTotal}` are the only price placeholders, filled from `_data/pricing.js` so no price is hardcoded in a translation; the yearly saving badge rounds down so it never overstates. The `js` subtree is serialized into the page as `window.HOUSTON_I18N` and holds runtime strings only. Spanish is LatAm neutral with "tú"; Portuguese is Brazilian with "você". Structure (tones, face rosters, logo paths, badges) lives in `_data/landing.js`, `_data/enterprise.js`, `_data/dataPartners.js`, `_data/refer.js`, whose arrays zip by index with the i18n arrays; brand names are not translatable and live in structure files. The download gate's generic failure string lives once in i18n and is applied both in markup and at runtime. Lives in `website/src/_data/` and `website/scripts/check-locales.mjs`.

## Script-safe JSON

Data embedded in a `<script>` escapes `<` and U+2028 / U+2029 (valid in JSON, line terminators in JavaScript). Lives in `website/eleventy.config.js`.

## Download gate lead delivery

A lead is posted to the gateway (`POST /v1/web/leads`) and, during the migration, to a Supabase table and a Google Sheet, independently and concurrently. The download unlocks as soon as any sink stored it (gateway 202, Supabase 2xx or 409, which means the address already exists). The Sheet is written `no-cors`, so its opaque answer gates nothing. The download stays locked only when every sink failed or the gateway answered 400 (the one correctable refusal); a 429 with a mirror row written is not a failure, since everyone behind a shared address hits that limit. Requests are not `keepalive` because the visitor stays on the page and keepalive caps the body. Both gating sinks share one timeout; without `AbortController` the attempt is abandoned on the clock so the visitor never waits forever. Only fields with values are sent. The entry point (`data-dl-source`) is sent in the shape the gateway accepts, or as unknown; the visitor id is read from the analytics identity asset, never minted here. After delivery, errors in analytics or showing the download are logged, not shown as a registration failure. Without the lead asset the gate fails closed. Lives in `website/src/assets/download-gate-lead.js` and `website/src/assets/download-gate-form.js`.

## Download gate modal and menus

The page uses Lenis smooth scroll, so the modal stops Lenis as well as freezing native scroll. Sub-assets (buttons, form) are optional and the modal still opens and closes without them. With a country menu open, the backdrop and Escape close only the menu so a near miss never discards a filled form. Country menus are fixed-positioned to escape the card's scroll clipping and follow their toggle as the viewport moves; on mobile the keyboard shrinks the visual viewport while `innerHeight` stays, so placement measures the visual viewport, flipping up only when below cannot hold a usable menu. `focus({ preventScroll })` keeps iOS from scrolling the document and dragging the anchor away. A hidden input never fires `input`, so it is dispatched by hand for the validator. A transformed ancestor would clip a fixed menu, so entrance wrappers drop their transform before the menu opens. Selector scoping (`.dl-dd`) wins on specificity rather than load order. A pinned OS shows its own group plus a reveal for all platforms, and the reported `os` is the one actually downloaded. The address is hashed in the analytics asset; only the SHA-256 digest is sent. Lives in `website/src/assets/download-gate*.js`, `website/src/assets/refer-country.js`, `website/src/assets/css/dl-dropdown.css`.

## First-party analytics

Four conversion events go to the gateway (`POST /v1/web/events`) so the funnel survives ad blockers; PostHog and GA4 are unchanged. The per-event optional fields mirror the gateway's `nameGatedFields`, because the gateway rejects a whole event carrying a field not allowed for its name. Identity is a uuid v4 in localStorage (the only shape the gateway stores); without the identity asset nothing is sent. Opting out of one sink (Do Not Track, consent) opts out of all. Only the referrer hostname is sent. Requests use `text/plain` so they stay CORS simple requests with no preflight, which `sendBeacon` cannot recover from. Missing SubtleCrypto yields no hash rather than an error. `appLink` carries the visitor id to the web app (`?hv=`), the only way to join the app's analytics across origins. Nothing may throw into the page. Lives in `website/src/assets/houston-analytics.js` and `website/src/assets/houston-analytics-identity.js`.

## Space background performance

The landing's Milky Way photo (ESO eso0932a, ESO/S. Brunier, CC BY 4.0) is a fixed, transformed element, not `background-attachment: fixed` (broken on iOS). Gecko composites the full-viewport fixed layers too slowly to transform each frame (about 35 fps scrolling versus 118 static), so Gecko is detected by `-moz-appearance` and the background stays static there. Engines without scroll-driven animations get a rAF fallback with the same transforms. Compositing hints are only on the moving element. Star twinkle lives on pseudo-elements so opacity is independent of the pan transform. Docs panels over space use near-opaque fills, never backdrop-filter, which re-blurs the moving photo every frame on Gecko. Lives in `website/src/assets/space.css`, `website/src/assets/space-scroll.js`, `website/src/learn/style.css`, `website/src/developers/style.css`.

## Motion

Hero motion uses self-hosted GSAP 3.15, ScrollTrigger and Lenis 1.3, with no text entrance; it bails entirely under reduced motion or a missing library. In-page anchor jumps go through Lenis in the capture phase, because native `scrollIntoView` fights its rAF scroll; native smooth scrolling is disabled where Lenis owns scroll. Motion is transform and opacity only with ease-out entrances. Split sections have no scroll snap, which fights momentum. Lives in `website/src/assets/hero-motion.js`, `website/src/assets/css/landing-motion.css`, `website/src/assets/css/landing-splits.css`, `website/src/assets/css/enterprise-flow.css`.

## Fonts and layout guards

SF Pro cannot be served from the web under Apple's license, so `--sans` asks for system SF and falls back to Inter (OFL, latin subset), which is not preloaded so Apple visitors never download it. The app-window mock uses the product's system font stack, not the site face. The nav collapses below 1200px (measured on Spanish, the tightest) and hides the GitHub icon and language menu below 560px. Single-column grid tracks use `minmax(0, ...)` because the body clips horizontal overflow and would silently crop copy. Form inputs stay at 16px so iOS Safari does not zoom on focus. Both Team prices share one grid cell so switching never moves layout. The light logo set for the proof band is pre-built by `scripts/make-light-logos.sh`, because a CSS knockout flattened two-tone marks. Lives in `website/src/assets/css/`.

## Share cards

Link-preview cards are made by `scripts/make-og-images.sh` (headless Chrome, captured with reduced motion so the hero is in its settled frame; Chrome exits 0 on a 404 or an empty write, so both are checked). The card URL carries a file hash because Slack, LinkedIn and WhatsApp cache cards by URL. Lives in `website/scripts/make-og-images.sh` and `website/src/_data/og.js`.

## Build-time data

The changelog fetch falls back to an empty list when GitHub is unreachable so builds never fail. The Supabase anon key is a public, RLS-protected client key but is injected at build time (`SUPABASE_ANON_KEY`) rather than committed. Empty Apps Script URLs turn the corresponding Sheet copies off. Lives in `website/src/_data/changelog.js` and `website/src/_data/env.js`.

## Certificates build

The certificates section is switched by `CERTS_EXPORT_TOKEN`: without it the section stays out of the build. The export is walked until an empty page, because the gateway and proxies can clamp `limit`, so a short page is not the end; the offset advances by what came back, and each request has a timeout so a hung gateway cannot hang the build. All derivation (casing, joins, dates, URLs) lives in `lib/certs/shape.mjs`. Remote data is validated at the build: certificate codes must match the gateway's code pattern because they become file paths (`path.join` normalizes `..`); event slugs must be lowercase hyphenated words and must not collide with shipped pages such as `verify`, which would abort the whole build with a duplicate permalink; display names follow the gateway's display-name policy (1 to 80 visible characters, no control or bidi override characters, at least one letter or digit); non-`YYYY-MM-DD` dates are dropped. The share page's image and `download` link are root-relative because `download` is ignored cross-origin; Open Graph URLs are absolute. Images are cached by content so `--serve` rebuilds stay usable. Lives in `website/lib/certs/` and `website/eleventy.config.js`.

## Certificate rendering

Images are rendered with satori (element tree to SVG) and resvg (SVG to PNG). satori does not rasterize inline `<svg>` children, so the logo and QR ship as data-URL `<img>`s; the QR keeps a white chip and quiet zone so it scans off a photograph. satori silently substitutes `.notdef` boxes for code points the bundled Latin fonts lack, so the build checks font coverage and logs loudly. satori adds tracking after the last glyph, so tracked centered lines get a compensating left margin and pills a shortened right pad. Fixed-height flex columns shrink children under yoga's defaults, so every block sets `flexShrink: 0`. Name sizes step by code-point count so a cohort's certificates match. Type never uses pure white on the cool photograph. The social card is its own layout, not a shrunken certificate, with a lighter tint for thumbnail size. Lives in `website/lib/certs/`.

## Payout and referral models

The payout estimate is a pure module shared by the estimator, the build's no-JS figure and the tests; its coefficients are fitted to the reference program's estimator and live in `_data/dataPartners.js`. Only companies at the 20-employee bar are priced; the slider is logarithmic; out-of-range input returns null so nothing formats NaN. Referral terms live in `_data/refer.js`, never below the program floor. Form rules are pure modules (`refer-model.js`, `data-partners-call-model.js`). Public form rows go to Supabase (the source of truth) and a Google Sheet copy. Lives in `website/src/assets/payout-model.js`, `website/src/_data/`, `website/src/assets/row-send.js`.

## Enterprise reel

Autoplay can be refused (iOS Low Power Mode), in which case the poster stands. The next clip starts slightly before the current one ends so the crossfade runs over two moving pictures. Lives in `website/src/assets/enterprise-reel.js`.

## Team pricing copy

`website/test/pricing.test.mjs` pins the published price and the copy around it: `src/_data/pricing.js`, the landing translations and the partials that render them. A Team seat has a monthly price and a lower yearly price and no free trial, so a trial must never come back through the data or a translation, and the free allowance is never given a number. `BARE_FREE` flags a bare "free" (es "gratis" or "gratuito", pt "grátis" or "gratuito") that is not the free tier's name, because a bare "free" reads as unlimited forever; the wording matches the app's (`app/tests/free-tier-copy.test.ts`). The partials render through Nunjucks directly rather than a full Eleventy build, which would fetch GitHub releases for the changelog.

Lives in `website/test/pricing.test.mjs` (`BARE_FREE`).
