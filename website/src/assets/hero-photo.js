/*
 * Photographic hero background helpers.
 *
 * 1. Variant switcher: `?bg=1|2|3|4` swaps the <picture> sources between the
 *    four astrophotography candidates (see the license comment in index.html).
 *    The default (1, ESO Milky Way panorama) is baked into the HTML so the
 *    common path needs no JS at all.
 * 2. Performance: the very slow Ken Burns drift is a CSS transform animation;
 *    this file pauses it while the hero is scrolled out of view so it never
 *    costs compositor time mid-page.
 */
(() => {
  var img = document.getElementById("hero-photo-img");
  if (!img) return;

  // name + art direction. `pos` (object-position) keeps the interesting region
  // when narrow viewports crop the sides; `full` picks the layout mode (see
  // .hero-photo-full in index.html): all-over textures run full-bleed behind
  // the whole hero, composition-sensitive photos stay in the top band.
  var VARIANTS = {
    1: { name: "cliffs", pos: "50% 0%", full: true },
    2: { name: "milkyway", pos: "50% 50%", full: false },
    3: { name: "horsehead", pos: "45% 35%", full: false },
    4: { name: "deepfield", pos: "50% 50%", full: true },
  };

  function srcset(name, ext) {
    return [1280, 1920, 2560]
      .map((w) => `/assets/space/${name}-${w}.${ext} ${w}w`)
      .join(", ");
  }

  var param = new URLSearchParams(window.location.search).get("bg");
  var variant = VARIANTS[param];
  var avif = document.getElementById("hero-photo-avif");
  var webp = document.getElementById("hero-photo-webp");
  var frame = document.getElementById("hero-photo");
  if (variant && variant.name !== "cliffs") {
    if (avif) avif.srcset = srcset(variant.name, "avif");
    if (webp) webp.srcset = srcset(variant.name, "webp");
    img.srcset = srcset(variant.name, "jpg");
    img.src = `/assets/space/${variant.name}-1920.jpg`;
    img.style.objectPosition = variant.pos;
    if (frame) frame.classList.toggle("hero-photo-full", variant.full);
  }

  // Pause the Ken Burns drift while the hero is off screen.
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        img.style.animationPlayState = entries[0].isIntersecting
          ? "running"
          : "paused";
      },
      { threshold: 0 },
    ).observe(img);
  }
})();
