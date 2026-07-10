/*
 * Spring micro-interactions (progressive enhancement, via vendored Motion One).
 *
 * Everything here is additive polish on top of CSS that already looks right:
 *   - With JS disabled or Motion unavailable, the site keeps its CSS `:hover`
 *     transitions — no interaction is gated on this file.
 *   - With prefers-reduced-motion, this file no-ops entirely.
 *
 * The springs are deliberately gentle (small scale, small lift). The goal is a
 * premium, physical feel, not a bouncy toy. Only the `transform` property is
 * animated, so colour/shadow CSS transitions on the same elements are untouched.
 */
(() => {
  var reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (reduce?.matches) return;

  var Motion = window.Motion;
  if (!Motion?.animate || !Motion.spring) return;

  var animate = Motion.animate;
  // Two spring flavours: a snappier one for presses, a softer one for settles.
  var pressSpring = Motion.spring({ stiffness: 520, damping: 30 });
  var settleSpring = Motion.spring({ stiffness: 320, damping: 26 });

  function to(el, transform, spring) {
    animate(el, { transform: transform }, { easing: spring });
  }

  // A hoverable/pressable element that scales. `rest` and `hover` are transforms.
  function springy(el, rest, hover, press) {
    var down = false;
    el.addEventListener("pointerenter", () => {
      if (!down) to(el, hover, settleSpring);
    });
    el.addEventListener("pointerleave", () => {
      down = false;
      to(el, rest, settleSpring);
    });
    el.addEventListener("pointerdown", () => {
      down = true;
      to(el, press, pressSpring);
    });
    function release() {
      if (!down) return;
      down = false;
      to(el, el.matches(":hover") ? hover : rest, pressSpring);
    }
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    // Keyboard press feedback, so focus users get the same physicality.
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") to(el, press, pressSpring);
    });
    el.addEventListener("keyup", () => {
      to(
        el,
        el.matches(":focus-visible") || el.matches(":hover") ? hover : rest,
        settleSpring,
      );
    });
  }

  function apply() {
    // Buttons: subtle scale up on hover, press in on click.
    document.querySelectorAll(".btn").forEach((b) => {
      if (b.classList.contains("btn-disabled")) return;
      springy(b, "scale(1)", "scale(1.035)", "scale(0.97)");
    });

    // Agent tabs (hero demo + "how it works") — same button feel.
    document.querySelectorAll(".hd-tab, .hiw-tab").forEach((t) => {
      springy(t, "scale(1)", "scale(1.05)", "scale(0.95)");
    });

    // Cards: a gentle lift on hover. Cards are not pressable, so no press state.
    document.querySelectorAll(".agent-card, .pricing-col").forEach((c) => {
      c.addEventListener("pointerenter", () => {
        to(c, "translateY(-4px)", settleSpring);
      });
      c.addEventListener("pointerleave", () => {
        to(c, "translateY(0px)", settleSpring);
      });
    });

    // Nav links: a whisper of movement on hover.
    document.querySelectorAll(".nav-center a").forEach((a) => {
      a.addEventListener("pointerenter", () => {
        to(a, "translateY(-1px)", settleSpring);
      });
      a.addEventListener("pointerleave", () => {
        to(a, "translateY(0px)", settleSpring);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  } else {
    apply();
  }
})();
