import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs build helper, no type declarations needed here.
import { composite, contrast, parseColor, withAlpha } from "../build/color.mjs";
// @ts-expect-error -- plain .mjs build helper, no type declarations needed here.
import { loadPalette } from "../build/omarchy.mjs";
import { palettes } from "../dist/ts/tokens.ts";

/**
 * The palette library's contract.
 *
 * A palette is a COMPLETE set, never a patch: `[data-palette="<id>"]` must
 * re-declare every single variable its mode's base block declares, because it
 * overrides that block on the same element. One missing name and the palette
 * silently keeps a Houston hex in the middle of someone else's colour scheme;
 * one extra name and the derivation has invented a role nothing consumes.
 *
 * The derived roles worn AS TEXT are then re-measured here against the surfaces
 * they are actually painted on, from the generated CSS rather than the build's
 * own maths — so a derivation change that loses a contrast floor fails here.
 */

const CSS = readFileSync(
  fileURLToPath(new URL("../dist/css/tokens.css", import.meta.url)),
  "utf8",
);

type Vars = Record<string, string>;
type Rgba = { r: number; g: number; b: number; a: number };

function block(selector: string): Vars {
  const escaped = selector.replace(/[[\]"]/g, "\\$&");
  const found = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(CSS);
  if (!found) throw new Error(`No ${selector} block in generated tokens.css`);
  const vars: Vars = {};
  for (const m of found[1].matchAll(/--(ht-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    vars[m[1]] = m[2].trim();
  }
  return vars;
}

const base = {
  light: block(":root"),
  dark: block('[data-theme="dark"]'),
} as const;

/** The contracted library: order, ids and names are the picker's own vocabulary. */
const EXPECTED = [
  ["houston-light", "Houston Light", "light"],
  ["houston-dark", "Houston Dark", "dark"],
  ["catppuccin-latte", "Catppuccin Latte", "light"],
  ["flexoki-light", "Flexoki Light", "light"],
  ["rose-pine", "Rosé Pine Dawn", "light"],
  ["lupine", "Lupine", "light"],
  ["white", "White", "light"],
  ["tokyo-night", "Tokyo Night", "dark"],
  ["catppuccin", "Catppuccin Mocha", "dark"],
  ["nord", "Nord", "dark"],
  ["gruvbox", "Gruvbox", "dark"],
  ["everforest", "Everforest", "dark"],
] as const;

const imported = palettes.filter((p) => !p.id.startsWith("houston-"));

/**
 * The primary button as Houston ships it: a near-ink solid with no rim in light,
 * a white frost with a hairline rim in dark. Pinned as literals because this
 * pair IS the Houston identity the palette library is measured against — a
 * derivation rule must never reach the base blocks and repaint it.
 */
const HOUSTON_CTA = {
  light: {
    "ht-cta": "#1b1b1e",
    "ht-cta-text": "#ffffff",
    "ht-cta-hover": "#2a2a2d",
    "ht-cta-rim": "transparent",
    "ht-cta-rim-hover": "transparent",
  },
  dark: {
    "ht-cta": "rgba(255, 255, 255, 0.08)",
    "ht-cta-text": "#ffffff",
    "ht-cta-hover": "rgba(255, 255, 255, 0.13)",
    "ht-cta-rim": "rgba(255, 255, 255, 0.2)",
    "ht-cta-rim-hover": "rgba(255, 255, 255, 0.3)",
  },
} as const;

/** Body text owes 4.5:1; `ink-muted` is secondary and owes the 3:1 floor. */
const NUDGED = [
  ["ht-ink-muted", 3],
  ["ht-link", 4.5],
  ["ht-success-ink", 4.5],
  ["ht-warning-ink", 4.5],
  ["ht-danger-ink", 4.5],
  ["ht-highlight-text", 4.5],
] as const;

describe("the palette library", () => {
  it("lists every palette once, in picker order", () => {
    expect(palettes.map((p) => [p.id, p.name, p.mode])).toEqual(
      EXPECTED.map((e) => [...e]),
    );
  });

  it("emits a CSS block for every import and none for the Houston sets", () => {
    const emitted = [...CSS.matchAll(/\[data-palette="([a-z-]+)"\]/g)].map(
      (m) => m[1],
    );
    expect(emitted).toEqual(imported.map((p) => p.id));
  });

  for (const palette of palettes) {
    it(`${palette.id} carries four swatch hexes`, () => {
      for (const [role, value] of Object.entries(palette.swatch)) {
        expect(
          parseColor(value),
          `${palette.id} swatch.${role} (${value}) is not a colour`,
        ).toMatchObject({ a: 1 });
      }
    });
  }

  // An import wears its own accent as the action colour, the focus ring and the
  // primary button; Houston's own two sets keep the monochrome action and their
  // authored buttons, so the accent rule must never leak into the base blocks it
  // is derived alongside.
  for (const mode of ["light", "dark"] as const) {
    it(`Houston ${mode} keeps a monochrome action and focus`, () => {
      const action = parseColor(base[mode]["ht-action"]) as Rgba;
      expect(base[mode]["ht-focus"]).toBe(base[mode]["ht-action"]);
      expect(
        new Set([action.r, action.g, action.b]).size,
        `--ht-action (${base[mode]["ht-action"]}) is a hue, not ink`,
      ).toBe(1);
      expect(action.a).toBe(1);
    });

    it(`Houston ${mode} keeps its own primary button`, () => {
      for (const [name, value] of Object.entries(HOUSTON_CTA[mode])) {
        expect(
          parseColor(base[mode][name]),
          `--${name} (${base[mode][name]}) moved off the shipped ${value}`,
        ).toEqual(parseColor(value));
      }
    });
  }
});

describe.each(imported)("palette $id", (palette) => {
  const vars = block(`[data-palette="${palette.id}"]`);
  const expected = base[palette.mode];

  it(`declares exactly the ${palette.mode} base block's variables`, () => {
    expect(Object.keys(vars).sort()).toEqual(Object.keys(expected).sort());
  });

  it("declares a parseable colour for every non-shadow variable", () => {
    for (const [name, value] of Object.entries(vars)) {
      if (name.startsWith("ht-shadow-")) continue;
      expect(() => parseColor(value), `--${name}: ${value}`).not.toThrow();
    }
  });

  // The ladder must bottom out on an opaque gutter, or every ratio below is
  // measured against a colour that does not exist.
  const gutter = parseColor(vars["ht-base"]) as Rgba;
  const screen = composite(vars["ht-background"], gutter) as Rgba;
  const surfaces: [string, Rgba][] = [
    ["screen", screen],
    ["field", composite(vars["ht-input"], screen) as Rgba],
    ["chip row", composite(vars["ht-chip"], screen) as Rgba],
    ["recessed row", composite(vars["ht-chip-subtle"], screen) as Rgba],
  ];

  it("composites its screen to an opaque colour", () => {
    expect(gutter.a).toBe(1);
    expect(screen.a).toBe(1);
  });

  for (const [name, floor] of NUDGED) {
    const measured: [string, Rgba][] =
      name === "ht-highlight-text"
        ? // The highlight ink is only ever printed on the highlight wash.
          [
            ...surfaces,
            ["highlight wash", composite(vars["ht-highlight"], screen) as Rgba],
          ]
        : surfaces;
    for (const [surfaceName, surface] of measured) {
      it(`--${name} clears ${floor}:1 on the ${surfaceName}`, () => {
        const ratio = contrast(vars[name], surface) as number;
        expect(
          ratio,
          `--${name} (${vars[name]}) measures ${ratio.toFixed(2)}:1 on the ${surfaceName}`,
        ).toBeGreaterThanOrEqual(floor);
      });
    }
  }

  // The primary button is the palette's loudest surface, and it speaks its mode's
  // grammar: a solid accent pill in light, Houston dark's frost pill tinted with
  // the accent in dark. Either way a Houston near-ink fill surviving here is the
  // bug this pair exists for.
  if (palette.mode === "light") {
    it("fills the primary button with its own accent, rimless", () => {
      const accent = parseColor(loadPalette(palette).accent) as Rgba;
      expect(parseColor(vars["ht-cta"])).toEqual(accent);
      for (const name of ["ht-cta-rim", "ht-cta-rim-hover"] as const) {
        expect(
          parseColor(vars[name]).a,
          `--${name} (${vars[name]}) rims a solid fill`,
        ).toBe(0);
      }
    });

    it("--ht-cta-text clears 4.5:1 on the primary button", () => {
      const fill = composite(vars["ht-cta"], screen) as Rgba;
      const ratio = contrast(vars["ht-cta-text"], fill) as number;
      expect(
        ratio,
        `--ht-cta-text (${vars["ht-cta-text"]}) measures ${ratio.toFixed(2)}:1 on --ht-cta`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  } else {
    it("frosts the primary button with its own accent", () => {
      const accent = parseColor(loadPalette(palette).accent) as Rgba;
      expect(parseColor(vars["ht-cta"])).toEqual(withAlpha(accent, 0.14));
      const rim = parseColor(vars["ht-cta-rim"]) as Rgba;
      const rimHover = parseColor(vars["ht-cta-rim-hover"]) as Rgba;
      for (const [name, value] of [
        ["ht-cta-rim", rim],
        ["ht-cta-rim-hover", rimHover],
      ] as const) {
        expect(
          value,
          `--${name} (${vars[name]}) is not the accent`,
        ).toMatchObject({ r: accent.r, g: accent.g, b: accent.b });
        expect(
          value.a,
          `--${name} (${vars[name]}) is not a translucent hairline`,
        ).toBeGreaterThan(0);
        expect(value.a).toBeLessThan(1);
      }
      expect(
        rimHover.a,
        "the hover rim is no denser than the resting rim",
      ).toBeGreaterThan(rim.a);
    });

    // The frost is translucent, so what it sits on is part of its colour: the
    // label owes the body floor on both surfaces a primary button sits on.
    for (const [name, under] of [
      ["field", "ht-input"],
      ["gutter", "ht-base"],
    ] as const) {
      it(`--ht-cta-text clears 4.5:1 on the frost over the ${name}`, () => {
        const fill = composite(vars["ht-cta"], vars[under]) as Rgba;
        expect(fill.a, `--${under} (${vars[under]}) is not opaque`).toBe(1);
        const ratio = contrast(vars["ht-cta-text"], fill) as number;
        expect(
          ratio,
          `--ht-cta-text (${vars["ht-cta-text"]}) measures ${ratio.toFixed(2)}:1 on the frost over the ${name}`,
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("wears its own accent as the action colour and the focus ring", () => {
    // Read from the vendored file, not from the build's own maths: the palette
    // IS its accent, and a derivation that quietly substituted another hue
    // would still be self-consistent.
    const accent = parseColor(loadPalette(palette).accent) as Rgba;
    expect(parseColor(vars["ht-action"])).toEqual(accent);
    expect(parseColor(vars["ht-focus"])).toEqual(accent);
  });

  it("--ht-action-text clears 4.5:1 on the CTA", () => {
    const fill = composite(vars["ht-action"], screen) as Rgba;
    const ratio = contrast(vars["ht-action-text"], fill) as number;
    expect(
      ratio,
      `--ht-action-text (${vars["ht-action-text"]}) measures ${ratio.toFixed(2)}:1 on --ht-action`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  for (const status of ["danger", "success", "warning"] as const) {
    it(`${status}'s label reads on its fill`, () => {
      const fill = composite(vars[`ht-${status}`], screen) as Rgba;
      const ratio = contrast(vars[`ht-${status}-text`], fill) as number;
      expect(
        ratio,
        `--ht-${status}-text measures ${ratio.toFixed(2)}:1 on --ht-${status}`,
      ).toBeGreaterThanOrEqual(3);
    });
  }

  for (const status of ["danger", "success", "warning"] as const) {
    it(`--ht-${status}-ink clears 4.5:1 on its own 15% wash`, () => {
      // A status chip washes its OWN hue behind its ink, which tints the backdrop
      // towards that ink — the densest wash on the most recessed row is the real
      // floor, and it is the one Houston's own contrast test already holds.
      const wash = composite(
        withAlpha(vars[`ht-${status}`], 0.15),
        surfaces[2][1],
      ) as Rgba;
      const ratio = contrast(vars[`ht-${status}-ink`], wash) as number;
      expect(
        ratio,
        `--ht-${status}-ink measures ${ratio.toFixed(2)}:1 on its own 15% wash`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});
