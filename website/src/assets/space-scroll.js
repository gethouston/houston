/*
 * Space background scroll controller.
 *
 * The background pans only while scrolling (no continuous/ambient motion — see
 * space.css). This file has two jobs, both progressive enhancement:
 *
 *   1. Opt Gecko (Firefox/Zen) out of the pan entirely. Gecko composites the
 *      full-viewport fixed layers too slowly to transform them every frame
 *      (measured ~35fps scroll vs ~118fps static, on BOTH the CSS scroll-timeline
 *      and rAF paths), and that was the landing's "scrolling is slow" bug. The
 *      `.space-no-parallax` class (space.css) cancels the pan so the background
 *      stays static there — still the full photo + stars, just not moving.
 *
 *   2. Drive the pan as a rAF fallback on engines that lack CSS scroll-driven
 *      animations (older WebKit), setting the exact transforms the @keyframes
 *      would. transform-only, so it stays on the compositor (no layout/paint).
 *
 * No-ops under prefers-reduced-motion (static background, per the design).
 */
(() => {
  var reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (reduce?.matches) return;

  var root = document.documentElement;
  var supports = window.CSS && typeof CSS.supports === "function";

  // (1) Gecko → static background. `-moz-appearance` is Firefox-only among
  // current engines, so it cleanly identifies Gecko (incl. Zen).
  if (supports && CSS.supports("-moz-appearance", "none")) {
    root.classList.add("space-no-parallax");
    return;
  }

  // Native scroll timeline available → CSS drives the pan, so we're done.
  if (supports && CSS.supports("animation-timeline", "scroll()")) return;

  // (2) rAF fallback (older WebKit): drive the same transforms inline.
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
