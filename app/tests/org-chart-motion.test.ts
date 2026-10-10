import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { durationMs, easing } from "@houston/design-tokens";
import {
  ENTRANCE_CURVE,
  PRESS_CLASS,
  PRESS_STYLE,
  REVEAL,
  revealDelay,
  revealKeyframes,
} from "../src/components/organization/org-chart-motion.ts";

describe("org chart motion", () => {
  it("takes its curve and durations from the motion tokens", () => {
    strictEqual(ENTRANCE_CURVE, `cubic-bezier(${easing.entrance.join(", ")})`);
    strictEqual(PRESS_STYLE.transitionDuration, `${durationMs.press}ms`);
    strictEqual(REVEAL.durationMs, durationMs.fast);
  });

  it("lets the class name what transitions, so the `scale` the press sets animates", () => {
    // Tailwind 4 compiles `active:scale-*` to the CSS `scale` property and
    // `transition-transform` to "transform, translate, scale, rotate". An
    // inline transition-property would override the class and the press
    // would snap instead of easing.
    strictEqual(PRESS_STYLE.transitionProperty, undefined);
    strictEqual(PRESS_CLASS.split(" ").includes("transition-transform"), true);
    strictEqual(PRESS_CLASS.includes("active:scale-[0.97]"), true);
  });

  it("staggers 40ms apart and stops adding delay after twelve nodes", () => {
    deepStrictEqual([0, 1, 2].map(revealDelay), [0, 40, 80]);
    strictEqual(revealDelay(40), revealDelay(REVEAL.maxSteps));
    // The whole reveal stays short however big the chart.
    strictEqual(revealDelay(999) + REVEAL.durationMs <= 700, true);
  });

  it("drops the rise under reduced motion and keeps the fade", () => {
    deepStrictEqual(revealKeyframes(true), [{ opacity: 0 }, { opacity: 1 }]);
    strictEqual(
      revealKeyframes(false)[0].transform,
      `translateY(${REVEAL.risePx}px)`,
    );
  });
});
