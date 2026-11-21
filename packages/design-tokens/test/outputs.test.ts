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
    expect(durationMs.press).toBe(160);
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
    expect(tier('[data-theme="dark"]', "field-focus")).toBe(
      "0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 2px 6px 0 rgba(0, 0, 0, 0.04)",
    );
    expect(tier('[data-theme="dark"]', "field-focus")).toBe(
      tier(":root", "field-focus"),
    );
  });

  it("opens the dark dialog tier with the glass sheen", () => {
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

describe("generated CSS motion and spacing", () => {
  const css = readFileSync(
    fileURLToPath(new URL("../dist/css/tokens.css", import.meta.url)),
    "utf8",
  );
  const value = (name: string): string | undefined =>
    new RegExp(`--ht-${name}\\s*:\\s*([^;]+);`).exec(css)?.[1]?.trim();

  it("exposes the entrance recipe's duration, curve and nudge as variables", () => {
    expect(value("duration-fast")).toBe("200ms");
    expect(value("easing-entrance")).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
    expect(value("space-4")).toBe("4px");
  });
});
