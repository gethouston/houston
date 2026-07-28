/*
 * Hero motion — minimal, on the professional stack (GSAP 3.15 + ScrollTrigger,
 * Lenis 1.3, self-hosted in /assets/vendor). Landing-only, deferred.
 *
 * Per Julian: NO text entrance (the hero copy renders instantly). Motion is
 * limited to (1) the app window rising once as you scroll to its plate and
 * (2) a whisper of scrub parallax on the hero glow. Lenis provides the
 * page-wide smooth scroll and stays in sync with anchor jumps.
 *
 * Accessibility: bails completely on prefers-reduced-motion or a missing
 * library, removing the `gsap-hero` head flag so the static page stands.
 * transform/opacity only.
 */
(() => {
  var docEl = document.documentElement;
  var reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  var Lenis = window.Lenis;

  // Reveal the static hero and stop if motion is off or a library is missing.
  if (reduce || !gsap || !ScrollTrigger || !Lenis) {
    docEl.classList.remove("gsap-hero");
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  // ── Canonical Lenis ⇄ GSAP integration ─────────────────────────────────────
  var lenis = new Lenis({ lerp: 0.11, smoothWheel: true });
  window.lenis = lenis; // idiomatic Lenis handle (debugging / programmatic scroll)
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  // Keep in-page anchor jumps smooth THROUGH Lenis — native scrollIntoView
  // fights Lenis's rAF-driven scroll. Capture phase + stopImmediatePropagation
  // cleanly supersedes the page's default handler while Lenis owns the scroll.
  document.addEventListener(
    "click",
    (e) => {
      var a = e.target.closest?.('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute("href");
      if (!id || id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      // Alias anchors sit INSIDE their section (below its top padding);
      // scroll to the section's real top so the viewport frames it whole.
      var dest = target.classList.contains("anchor-alias")
        ? target.closest("section") || target
        : target;
      lenis.scrollTo(dest);
    },
    true,
  );

  // Static text, staged window: everything visible except the window, which
  // rises once when its plate scrolls into view.
  var intro = document.querySelector(".hero-intro");
  var visual = document.querySelector(".hero-visual");
  var win = document.querySelector(".hero-stage .win");

  gsap.set([intro, visual].filter(Boolean), { opacity: 1 });

  if (win) {
    gsap.set(win, {
      opacity: 0,
      y: 60,
      scale: 0.96,
      rotateX: 6,
      transformOrigin: "50% 18%",
    });
    gsap.to(win, {
      opacity: 1,
      y: 0,
      scale: 1,
      rotateX: 0,
      duration: 1.1,
      ease: "power2.out",
      scrollTrigger: { trigger: ".hero-visual", start: "top 82%", once: true },
    });
  }

  // A whisper of depth on the hero glow while the fold scrolls away.
  gsap.to(".hero-glowfield", {
    y: 20,
    ease: "none",
    scrollTrigger: {
      trigger: ".hero",
      start: "top top",
      end: "bottom top",
      scrub: 0.5,
    },
  });

  window.addEventListener("resize", () => {
    ScrollTrigger.refresh();
  });
})();
