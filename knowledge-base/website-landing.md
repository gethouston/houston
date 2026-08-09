# Website landing — the black-and-white system (July 2026)

The landing (`website/src/index.njk` + `_includes/landing/*` + `assets/css/landing*.css`)
was rebuilt in a strict black-and-white system: Houston owns ink and white, no
color except the product's own UI (agent avatar tints, mention blue, brand
marks). Reference feel: the legacy `/startups` page's cleanliness, Apple-grade
minimalism. Type is the SYSTEM stack everywhere; General Sans appears only in
the wordmark (Fontshare block in `base.njk`).

## Page rhythm — alternating grounds

Black and white alternate down the page; the alternation IS the visual
interest (no scroll-snap — it read as "locking" and was removed):

hero (black) → multiplayer (white) → parallel/multi-agent (black, full-bleed
`.section.is-dark`) → compound (white) → stack (black) → pricing (white) →
FAQ (white) → footer (black). `#multiplayer/#parallel/#compound/#stack` are
one-viewport stories (`min-height: 100svh`, centered, ≥881px only).

The hero fold also fills the viewport (`min-height: 100svh` on `.hero-fold`),
whatever the browser chrome's height (Chrome's tab bar vs Arc/Zen's none):
its natural height (496px `.win-body` floor) already ≈ fills Chrome, and any
taller viewport's slack flows down a flex stretch chain
(`.hero-visual → .hero-stage → .win → .win-body`, landing-hero.css) so the
app window's bottom stays flush with the fold's dissolve — never a white gap
before #multiplayer.

`.section.is-dark` = full-bleed near-black band; content keeps the shared
measure via `.section.is-dark > *`. Dark-ground variants exist for the
segmented pill, `.acol`/`.share-mock` (white ring + deep black shadow), and
stat/stack tiles.

## Nav — section-aware frost

One nav (`landing/nav.njk`). Transparent over the hero; scrolled it frosts
BLACK over dark grounds and WHITE (ink chrome) over light ones — scripts.njk
samples the element under the bar (`.hero, .section.is-dark, .lfoot`) and
toggles `.on-light`. Subpages (`.lnav-solid`) always use the white bar. The
resources dropdown and mobile sheet follow the bar's mode. No bottom hairlines
on the white bar/sheet.

## Components (landing-wide language)

- **Segmented pill tabs** (`.chat-tabs`): ONE bordered capsule, ink-filled
  active segment (white-filled on dark). Used by multiplayer chat, parallel
  agent switcher, compound views.
- **Cards everywhere**: FAQ items, pricing columns, compound rows (each
  learning/skill its own bordered card), context files as gallery tiles with
  CSS-miniature previews (`.file-prev`: page/sheet/folder + type badge).
- **Stack tiles** (`stack.njk`): four dark tiles with monochrome-white brand
  marks rendered through ONE `mark(id)` njk macro, which looks the path data up
  in `landing.stack.marks[id]` (`_data/landing.js` — the single source of the
  brand paths, so size/placement/tone cannot drift). Each tile's `logos` array
  holds ids. Every tile closes with a `.st-more` line so walls align. Jan has no
  vector mark → `.st-word` wordmark chip.
- **Pricing**: annual price leads ($12 big, "billed annually · $15 billed
  monthly" small; from `_data/pricing.js`, never hardcoded). Team card is a
  full ink card ("the one loud object") with checklists (`.price-list`,
  masked check glyph). Free card is personal-first ("Your personal workspace,
  free forever" → grows to three people).

## Motion

- Vendored GSAP + ScrollTrigger + Lenis (`assets/vendor/`, licence README).
  `hero-motion.js`: window rise on scroll, glow parallax, Lenis smooth scroll +
  anchor interception. Anchor clicks on `.anchor-alias` spans resolve to the
  CLOSEST SECTION top (aliases sit below section padding; scrolling to the
  span overshoots and leaks the next section at the viewport bottom).
- **Hero board demo** (`hero-demo*.js`): `hero-demo-clock.js` is load-bearing —
  it was deleted once in a cleanup and the demo silently died (hero-demo.js
  bails without `createHeroDemoClock`). All four files stay together.
- **Compound live learnings** (scripts.njk): while the Learnings panel is
  visible, a pooled learning slides in every ~3.8s ("just now" + avatar) and
  `[data-cl-count]` ticks up. Reduced motion: static list stands.
- Auto-rotating `data-swap-group` switchers (5s, pause on hover/user takeover).

## i18n (HOU-1177, Aug 2026) — en / es / pt landings

The landing ships at `/`, `/es/`, `/pt/`. Architecture: **structure and copy are
split**. Text lives in `website/src/_data/i18n/{en,es,pt}.js` (identical key
trees, validated by `npm run check:locales`: key/array parity, no em dashes);
non-translatable structure (avatar classes, face rosters, brand SVG paths) in
`_data/landing.js`, zipped BY INDEX with the i18n arrays. Locale plumbing:
`_data/locales.js` + `_data/eleventyComputed.js` compute `t`, `locale`, and
`root` per page from front-matter/directory `lang` (`src/es/es.11tydata.js`).
The three landing pages are stubs extending `_includes/landing.njk`, which owns
meta/OG/JSON-LD/hreflang (generated from locales.js, never hand-written).
Browser JS reads `window.HOUSTON_I18N` (the `js` subtree, emitted by
`landing/i18n-data.njk` via the `jsonScript` filter) through
`window.houstonT(path, enFallback)` — hero demo, chat scenarios, learnings
pool, gate labels. Chrome (nav/footer/gate) localizes on EVERY page including
`/guides/es/`. Language switcher: nav dropdown (`[data-menu]`, hidden <880px —
the nav has no mobile layout, HOU-1180) + footer row + a first-visit
suggestion card on `/` only (`lang-banner.njk`, keyed off navigator.language,
choice stored in `localStorage.houston_lang_pref`, never auto-redirects).
Sitemap is now GENERATED (`src/sitemap.njk` → /sitemap.xml with xhtml
alternates); es = LatAm neutral (tú), pt = Brazilian (você); scope excludes
vision/startups/legal/changelog. Spanish demo copy keeps @Mentions and person
names; country names in the gate localize via Intl.DisplayNames while the
POSTED value stays the English name.

## Download gate (HOU-1168, Aug 2026)

One two-step modal replaces the old invite-code gates AND the standalone
`/waitlist/` page (deleted; 301 → `/#download`): step 1 is the waitlist's lead
form (name, email, phone with country-code dropdown, LinkedIn, country), step 2
the OS-aware download buttons (Windows keeps the x64/ARM64 promote logic in
scripts.njk via the preserved `dl-windows-*` ids). Pieces: markup
`landing/download-modals.njk`; styles `assets/css/download-gate.css` +
`assets/css/dl-dropdown.css`; logic in SIX classic scripts, config-injected and
`defer`-loaded in this order by `landing/scripts-download.njk` (which also emits
`window.HOUSTON_DL_CONFIG` from `_data/env.js`):
`download-gate-countries.js` (the country + dial-code data),
`download-gate-placement.js` (pure flip/clamp math, unit-tested with no DOM via
`test/placement.test.mjs`), `download-gate-anchor.js` (keeps an open fixed menu
pinned to its toggle — an anchor that moved is a menu to re-place, never one to
close, which is what used to kill the country menu when the phone keyboard slid
in), `download-gate-dropdown.js`, `download-gate-form.js`, `download-gate.js`.
`download-gate.css` is the ONE gate stylesheet, loaded by the landing
AND subpages (the old duplicate block in landing-hero.css is gone). Writes go to
the same Supabase `waitlist` table (`source: "download_gate"`) + Sheet mirror
— the gate is the ONE place Supabase deliberately stays, and it is a plain
anon-key data write, not auth (app identity is GCIP/Firebase, `auth.md`);
`localStorage.houston_dl_registered` skips the form for returning visitors;
failures surface inline (`#dl-form-err`). Details + funnel events:
`production-infra.md` → Download gate.

Gate v2 (HOU-1178): opening the modal scroll-locks the page (`lockScroll()` in
download-gate.js: `lenis.stop()` + `html.dl-modal-open`; `data-lenis-prevent`
on `.dl-card` and menus — Lenis otherwise eats wheel events over the
fixed-position dropdowns). Both the country-code menu and the Country field
use ONE searchable dropdown component (`download-gate-dropdown.js`,
`window.HoustonDropdown`, placed by `download-gate-placement.js` and kept
pinned by `download-gate-anchor.js`): fixed positioning with flip/clamp,
keyboard + ARIA combobox semantics, Escape closes the menu not the modal. The
Country field's hidden input dispatches a synthetic bubbling `input` event on
select — without it the submit button never enables.

## Certificates

Bootcamp participation certificates are rendered to PNG at build time with
satori + resvg, not styled in CSS, and follow their own visual system (a
full-bleed photograph under a translucent glass panel, General Sans).
See `knowledge-base/website-certificates.md`.
