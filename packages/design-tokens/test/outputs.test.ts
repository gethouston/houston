import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  breakpoint,
  breakpointPx,
  color,
  durationMs,
  easing,
  radius,
  shadow,
  space,
} from "../dist/ts/tokens.ts";

/**
 * Smoke test: the generated TypeScript entry point is importable, typed, and
 * carries the values downstream JS relies on (e.g. motion durations).
 */

/** The elevation ladder, shallow to deep. Every theme carries all of it. */
const TIERS = [
  "edge",
  "field",
  "field-focus",
  "card",
  "raised",
  "drag",
  "dialog",
];
describe("generated TypeScript tokens", () => {
  it("exposes both themes with the same colour keys", () => {
    expect(Object.keys(color.light)).toEqual(Object.keys(color.dark));
    expect(color.light.input).toBe("#fcfcfc");
    expect(color.dark.input).toBe("#1e1e1e");
  });

  it("exposes numeric motion durations for JS animation", () => {
    expect(durationMs.fast).toBe(200);
    expect(easing.standard).toEqual([0.25, 0.1, 0.25, 1]);
  });

  it("exposes scale tokens", () => {
    expect(space["16"]).toBe("16px");
    expect(radius.composer).toBe("28px");
  });

  it("exposes every elevation tier in both themes", () => {
    expect(Object.keys(shadow.light)).toEqual(TIERS);
    expect(Object.keys(shadow.dark)).toEqual(TIERS);
  });

  it("exposes the mobile breakpoint in both CSS and JS forms", () => {
    // Must stay equal to Tailwind v4's default `md` boundary — the token is
    // what keeps useIsMobile() and the `md:` utilities on the same edge.
    expect(breakpoint.mobile).toBe("768px");
    expect(breakpointPx.mobile).toBe(768);
  });
});

describe("generated CSS elevation", () => {
  const css = readFileSync(
    fileURLToPath(new URL("../dist/css/tokens.css", import.meta.url)),
    "utf8",
  );

  // A tier missing from one block is a component with no depth under that
  // theme, which is exactly what the Tailwind bridge cannot fall back from.
  it.each([
    ":root",
    '[data-theme="light"]',
    '[data-theme="dark"]',
  ])("defines every tier in %s", (selector) => {
    const escaped = selector.replace(/[[\]"]/g, "\\$&");
    const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    expect(block, `no ${selector} block`).not.toBeNull();
    const defined = [
      ...(block?.[1] ?? "").matchAll(/--ht-shadow-([a-z-]+)\s*:\s*[^;]+;/g),
    ].map((m) => m[1]);
    expect(defined).toEqual(TIERS);
  });
});
