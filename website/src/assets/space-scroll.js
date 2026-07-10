/*
 * Scroll-driven parallax — JS fallback for the fixed space background.
 *
 * The primary path is pure CSS (animation-timeline: scroll(), see space.css).
 * This file only runs where that is unsupported (older/most WebKit), driving
 * the exact same transforms from a rAF-throttled scroll listener so the photo +
 * star layers still pan as you travel the page. transform-only, so it stays on
 * the compositor with no layout or paint.
 *
 * No-ops entirely when:
 *   - prefers-reduced-motion is set (static background, per the design), or
 *   - the browser supports scroll-driven CSS animations (CSS already handles it).
 */
(() => {
  var reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (reduce?.matches) return;

  // Native scroll timeline available → CSS drives it, nothing to do here.
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
  var SCALE_RANGE = 0.06; // 1.16 → 1.22
  var IMG_SHIFT = 4.5; // percent, upward
  var STARS_SHIFT = 14; // percent, upward (faster → depth)

  document.documentElement.classList.add("space-js-parallax");

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
