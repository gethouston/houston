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
  marks rendered through ONE `mark(label, d)` njk macro (simple-icons paths as
  data). Every tile closes with a `.st-more` line so walls align. Jan has no
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

## History note

The session that produced this also trialled and DISCARDED: Oro-style poster
hero (image + corner frames + fixed dock), generated backdrop videos (Veo,
slowed/looped via ffmpeg), an aurora WebGL shader, and scroll-snap. If those
return, mine git history of this branch — the plumbing (video treatment
pipeline, shader, poster layout) all worked; the direction was rejected in
favour of the plain B/W statement hero.
