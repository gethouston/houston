(() => {
  var docEl = document.documentElement;
  var reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  var Lenis = window.Lenis;

  if (reduce || !gsap || !ScrollTrigger || !Lenis) {
    docEl.classList.remove("gsap-hero");
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  var lenis = new Lenis({ lerp: 0.11, smoothWheel: true });
  window.lenis = lenis;
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

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
      var dest = target.classList.contains("anchor-alias")
        ? target.closest("section") || target
        : target;
      lenis.scrollTo(dest);
    },
    true,
  );

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
