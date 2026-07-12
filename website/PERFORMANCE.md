# Landing performance constraints

The landing (`src/index.html` + `src/assets/space.*`) renders a full-page space
photo behind many dark-glass panels. Two hard rules keep it smooth, learned from
a real regression: the live page was unusable in **Zen (Gecko/Firefox)** —
~40 fps idle, ~24 fps on scroll, heavy jank — while Chromium and WebKit looked
fine. Prior verification only tested Chromium + WebKit and missed it.

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
before/after screenshots, desktop + mobile). The only kept blur is the transient
`.dl-overlay` modal, which sits over a now-static background.

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
