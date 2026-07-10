/*
 * Space background motion controller.
 *
 * Two jobs:
 *   1. Pause the ambient CSS motion (photo drift + star twinkle, see space.css)
 *      while the tab is hidden, by toggling `.space-idle` on <html>. Runs on
 *      EVERY engine — the ambient animations are plain time-based CSS.
 *   2. Drive the scroll-driven pan as a rAF fallback where CSS scroll-driven
 *      animations (animation-timeline: scroll(), the primary path in space.css)
 *      are unsupported (older/most WebKit), setting the exact same transforms
 *      the CSS @keyframes would. transform-only, so it stays on the compositor
 *      with no layout or paint.
 *
 * No-ops entirely under prefers-reduced-motion (static background, per the
 * design — nothing to pause, nothing to pan).
 */
(() => {
  var reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (reduce?.matches) return;

  // (1) Pause ambient drift/twinkle when the tab is backgrounded — no wasted
  // compositor work, and motion resumes cleanly on return. Always attached.
  var root = document.documentElement;
  function syncVisibility() {
    root.classList.toggle("space-idle", document.hidden);
  }
  document.addEventListener("visibilitychange", syncVisibility);
  syncVisibility();

  // Native scroll timeline available → CSS drives the pan, so we're done.
  var hasScrollTimeline =
    window.CSS &&
    typeof CSS.supports === "function" &&
    CSS.supports("animation-timeline", "scroll()");
  if (hasScrollTimeline) return;

  var img = document.querySelector(".space-bg img");
  var stars = document.querySelector(".space-stars");
  if (!img && !stars) return;

  // Keep these in lockstep with the @keyframes in space.css.
  var BASE_SCALE = 1.16;
  var SCALE_RANGE = 0.12; // 1.16 → 1.28
  var IMG_SHIFT = 8; // percent, upward
  var STARS_SHIFT = 22; // percent, upward (faster → depth)

  root.classList.add("space-js-parallax");

  var ticking = false;

  function apply() {
    ticking = false;
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (img) {
      img.style.transform = `scale(${(BASE_SCALE + SCALE_RANGE * p).toFixed(4)}) translate3d(0, ${(-IMG_SHIFT * p).toFixed(3)}%, 0)`;
    }
    if (stars) {
      stars.style.transform = `translate3d(0, ${(-STARS_SHIFT * p).toFixed(3)}%, 0)`;
    }
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(apply);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  apply();
})();
