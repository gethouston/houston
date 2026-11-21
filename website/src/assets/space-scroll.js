(() => {
  var reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (reduce?.matches) return;

  var root = document.documentElement;
  var supports = window.CSS && typeof CSS.supports === "function";

  if (supports && CSS.supports("-moz-appearance", "none")) {
    root.classList.add("space-no-parallax");
    return;
  }

  if (supports && CSS.supports("animation-timeline", "scroll()")) return;

  var img = document.querySelector(".space-bg img");
  var stars = document.querySelector(".space-stars");
  if (!img && !stars) return;

  var BASE_SCALE = 1.16;
  var SCALE_RANGE = 0.12;
  var IMG_SHIFT = 8;
  var STARS_SHIFT = 22;

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
