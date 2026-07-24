# Space-photo performance constraints

These rules were learned on the landing page, which once rendered a full-page,
`position: fixed` space photo behind many dark-glass panels. That page is now
**`src/index.njk` + its `src/_includes/landing/` partials + `src/assets/css/landing-*.css`**,
and its space photo is **hero-only** — the `.hero-sky` layer inside the first
viewport, not a full-page fixed background. So the specific "full-page fixed
layer" failure modes below no longer apply to the landing itself.

They still bind everywhere the shared full-page background lives:
**`src/_includes/space-bg.njk`** (the fixed `.space-bg` photo + scrim + stars,
styled by **`src/assets/space.css`** and parallaxed by
**`src/assets/space-scroll.js`**) on every subpage that includes it, and the
**`.dl-overlay`** download modal (see Rule 2). Treat "the landing page" in the
rules below as "any surface carrying the full-page space background or the
download modal."

The two hard rules were learned from a real regression: the live page was
unusable in **Zen (Gecko/Firefox)** — ~40 fps idle, ~24 fps on scroll, heavy
jank — while Chromium and WebKit looked fine. Prior verification only tested
Chromium + WebKit and missed it.

## Rule 1 — no continuous/idle animation on the full-page background

A time-based ambient drift on the photo + a star twinkle used to run forever
(even at rest). On Gecko, animating a full-viewport `position: fixed` layer every
frame re-composites the whole layer, and doing it **under** the backdrop-blurred
glass panels forced a full-page re-blur every frame. Measured idle: **~46 fps
(Gecko) with the ambient on → ~120 fps with it off.** Blink/WebKit hid the cost.

Background motion must be **scroll-driven only** (it changes only while
scrolling), never a looping keyframe animation.

## Rule 2 — no `backdrop-filter` over a moving background

`backdrop-filter: blur()` on a panel is cheap only while the pixels behind it are
static. As soon as the panel moves relative to its backdrop (scroll) **or** the
backdrop moves under it (parallax/ambient), Gecko re-rasterizes the blur every
frame. With the many glass panels on this page that capped scroll at ~30 fps.

The glass panels therefore carry **no `backdrop-filter`** — they use near-opaque
dark fills (`--glass` / `--glass-strong` ≈ 0.92–0.95 alpha) instead. Over the
dark scrimmed photo the frosted look is visually identical (verified with
before/after screenshots, desktop + mobile).

The `.dl-overlay` download modal was the last holdout ("static background, so
the blur is cheap") and it, too, is now blur-free (plain `rgba(0,0,0,0.6)`
scrim). Two reasons, found when users reported the modal open felt glitchy:
(a) `backdrop-filter` ignores the element's own `opacity`, so during the
overlay's 0.2 s opacity fade the full-screen blur snapped in at 100 % on the
first frame while the tint faded — a visible pop; (b) rasterizing a
full-viewport blur during the fade janked the animation itself. Measured
(5× open cycles, rAF deltas): Chromium 4× throttle 45 fps / 27 jank frames →
108 fps / 0; Firefox 39 fps / 30 jank (worst frame 117 ms) → 114 fps / 0.
**The landing page now has zero `backdrop-filter` anywhere.** Keep it that way.

## Hero mockup aurora — faithful colours, but static and blur-free

The hero app-window is a pure-CSS Houston Mission Control (`.win` in
`src/assets/css/landing-app-window.css`) — no image, no canvas, and **no scripted
demo** (the old motion-driven `hero-demo.*` mock is gone). It reproduces the real
app's dark theme: a dark gutter base (`--w-canvas`) plus an aurora bleed, with
translucent board/chat panels (`--w-panel`) letting it show through. Two
properties keep both rules above intact: the aurora is **static** (no drift, so
it never re-composites), and the translucent panels carry **no
`backdrop-filter`** (the smooth gradient behind them needs no blur to look
clean). Do not add a drift or a blur — that reintroduces Rule 1/Rule 2 costs for
zero visual gain.

## Gecko can't pan a full-bleed layer at 60 fps

Even with ambient + blur removed, transforming the full-viewport photo/star
layers per scroll frame stays ~35 fps on Gecko — on **both** the CSS
`animation-timeline: scroll()` path and the rAF fallback, and regardless of image
size. It's the compositing of a full-bleed fixed layer, not the driver.

So the scroll parallax is **gated off on Gecko** (`space-scroll.js` adds
`.space-no-parallax` when `CSS.supports("-moz-appearance","none")`): the
background is static there (still the full photo + stars, just not panning).
Blink + modern WebKit keep the parallax on the compositor cheaply, so they keep
it. `prefers-reduced-motion` freezes everything on every engine.

## Test matrix — Gecko is mandatory

Any change to `space.css`, `space-scroll.js`, `micro-interactions.js`, or the
glass panels MUST be measured on **Firefox/Gecko**, not just Chromium + WebKit.
Playwright has all three; install Firefox once with
`npx playwright install firefox`. Measure (a) idle frame cost over ~5 s untouched
and (b) fps during a scripted 3 s smooth scroll, via in-page `requestAnimationFrame`
timestamp deltas (the only signal that works identically across engines). Target:
zero jank frames (> 25 ms) idle, ~60 fps sustained on scroll, on all three.

## Result of the fix (headless Playwright, 1440×900, in-page rAF deltas)

| Engine (idle → scroll fps) | Before | After |
| --- | --- | --- |
| Firefox / Gecko | 40 → 27 (94 idle jank frames) | 120 → 118 (0 jank) |
| Chromium | (8% busy) → 67 | (8% busy) → 120 (0 jank) |
| Chromium, 4× CPU throttle | → 60 (19 jank) | → 119 (0 jank) |
| WebKit | 60 → 60 | 60 → 60 |
