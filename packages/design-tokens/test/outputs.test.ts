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

  const block = (selector: string): string => {
    const escaped = selector.replace(/[[\]"]/g, "\\$&");
    const found = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    expect(found, `no ${selector} block`).not.toBeNull();
    return found?.[1] ?? "";
  };

  const tier = (selector: string, name: string): string => {
    const value = new RegExp(`--ht-shadow-${name}\\s*:\\s*([^;]+);`).exec(
      block(selector),
    );
    expect(value, `no --ht-shadow-${name} in ${selector}`).not.toBeNull();
    return (value?.[1] ?? "").trim();
  };

  // A tier missing from one block is a component with no depth under that
  // theme, which is exactly what the Tailwind bridge cannot fall back from.
  it.each([
    ":root",
    '[data-theme="light"]',
    '[data-theme="dark"]',
  ])("defines every tier in %s", (selector) => {
    const defined = [
      ...block(selector).matchAll(/--ht-shadow-([a-z-]+)\s*:\s*[^;]+;/g),
    ].map((m) => m[1]);
    expect(defined).toEqual(TIERS);
  });

  it("keeps the dark focused field wearing the two layers focus already wore", () => {
    // The composer spelled its focus depth as
    // `focus-within:shadow-[0_1px_2px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.04)]`,
    // an unprefixed arbitrary value that outranked the zero-specificity `dark:`
    // variant beside it, so a focused field in DARK wore exactly these two
    // layers too. The tier inherits that resolved value rather than inventing a
    // dark focus depth the product never shipped.
    expect(tier('[data-theme="dark"]', "field-focus")).toBe(
      "0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 2px 6px 0 rgba(0, 0, 0, 0.04)",
    );
    expect(tier('[data-theme="dark"]', "field-focus")).toBe(
      tier(":root", "field-focus"),
    );
  });

  it("opens the dark dialog tier with the glass sheen", () => {
    // The sheen is the FIRST layer of the tier, not a separate `.bg-dialog`
    // rule: a descendant rule at (0,2,0) outranks `.ht-shadow-dialog` (0,1,0)
    // and replaces the whole box-shadow, so a framed dark dialog kept the sheen
    // and lost every ambient layer under it.
    expect(tier('[data-theme="dark"]', "dialog")).toBe(
      [
        "inset 0 1px 0 0 rgba(255, 255, 255, 0.06)",
        "0 4px 4px 0 rgba(0, 0, 0, 0.1)",
        "0 4px 80px 8px rgba(0, 0, 0, 0.2)",
        "0 0 1px 0 rgba(255, 255, 255, 0.1)",
      ].join(", "),
    );
  });
});
