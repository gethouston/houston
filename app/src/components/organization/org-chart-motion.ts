import { duration, durationMs, easing } from "@houston/design-tokens";
import type { CSSProperties } from "react";

export const ENTRANCE_CURVE = `cubic-bezier(${easing.entrance.join(", ")})`;
const STANDARD_CURVE = `cubic-bezier(${easing.standard.join(", ")})`;

export const PRESS_CLASS = "transition-transform active:scale-[0.97]";

export const PRESS_STYLE: CSSProperties = {
  transitionDuration: duration.press,
  transitionTimingFunction: ENTRANCE_CURVE,
};

const PRESS_PROPERTIES = ["transform", "translate", "scale", "rotate"];
const PAINT_PROPERTIES = [
  "color",
  "background-color",
  "border-color",
  "opacity",
];

export const STEP_PRESS_STYLE: CSSProperties = {
  transitionProperty: [...PRESS_PROPERTIES, ...PAINT_PROPERTIES].join(", "),
  transitionDuration: [
    ...PRESS_PROPERTIES.map(() => duration.press),
    ...PAINT_PROPERTIES.map(() => duration.fast),
  ].join(", "),
  transitionTimingFunction: [
    ...PRESS_PROPERTIES.map(() => ENTRANCE_CURVE),
    ...PAINT_PROPERTIES.map(() => STANDARD_CURVE),
  ].join(", "),
};

export function swapInKeyframes(reduced: boolean): Keyframe[] {
  return reduced
    ? [{ opacity: 0.5 }, { opacity: 1 }]
    : [
        { opacity: 0.5, filter: "blur(2px)" },
        { opacity: 1, filter: "blur(0)" },
      ];
}

export const REVEAL = {
  stepMs: 40,
  maxSteps: 12,
  durationMs: durationMs.fast,
  risePx: 5,
} as const;

export function revealDelay(index: number): number {
  return Math.min(index, REVEAL.maxSteps) * REVEAL.stepMs;
}

export function revealKeyframes(reduced: boolean): Keyframe[] {
  return reduced
    ? [{ opacity: 0 }, { opacity: 1 }]
    : [
        { opacity: 0, transform: `translateY(${REVEAL.risePx}px)` },
        { opacity: 1, transform: "translateY(0)" },
      ];
}
