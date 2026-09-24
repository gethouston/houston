import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  composite,
  contrast,
  hueDistance,
  parseColor,
  saturation,
  withAlpha,
  // @ts-expect-error -- plain .mjs build helper, no type declarations needed here.
} from "../build/color.mjs";
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

/**
 * How far a status hue may drift from Houston's while the ladder walks it toward
 * a palette's own ink. Twenty degrees is a shade of the same colour; a hue that
 * travels further is a different colour, and a gray is no colour at all
 * (`hueDistance` answers `Infinity` for one).
 */
const HUE_TOLERANCE = 20;

/**
 * How much colour a nudged status role must still carry, as HSL saturation.
 *
 * A hue angle alone does not say a colour is coloured: channels one eight-bit
 * step apart carry a perfectly well-defined hue, so `#3a3a3b` is "blue" and would
 * pass the tolerance above while a "Delete forever" pill read as plain gray. The
 * floor is what makes the hue check mean something. Every shipped role clears
 * 0.29 (Everforest's link is the closest), so 0.25 leaves the ladder room to walk
 * a role toward a palette's ink without letting it arrive at a gray.
 */
const CHROMA_FLOOR = 0.25;

/**
 * The status roles the ladder NUDGES: the three inks, the link and the highlight
 * label, each printed as text and therefore re-measured on this palette's own
 * surfaces. They may drift, so they get the hue-and-chroma pair; everything else
 * in the family is inherited verbatim and gets pinned as an exact colour.
 */
const NUDGED_HUES = [
  "ht-danger-ink",
  "ht-success-ink",
  "ht-warning-ink",
  "ht-link",
  "ht-highlight-text",
] as const;

/**
 * The status roles inherited UNCHANGED: every fill, the destructive ring and the
 * highlight wash. Nothing measures them against a palette surface, so a drift of
 * one step here is a derivation reaching a family it has no say in.
 */
const INHERITED = [
  "ht-danger",
  "ht-danger-fill",
  "ht-danger-ring",
  "ht-success",
  "ht-warning",
  "ht-highlight",
] as const;

/** A nudged role: the floor it owes, and the wash it is printed on. */
type Nudged = {
  name: string;
  floor: number;
  wash?: { hue: string; alphas: number[] };
};

/**
 * Every role the derivation nudges, with the floor it owes and, when the role is
 * printed on a wash of a hue, the token that wash is made of and the alphas it
 * wears. A wash is not a neutral surface: it tints the backdrop TOWARDS the ink
 * sitting on it, so a role measured only on the plain rows is measured against
 * the easiest case. Body text owes 4.5:1; `ink-muted` is secondary and owes 3:1.
 *
 * `--ht-link` washes ITSELF (`bg-link/10`, the chat link chip), the status inks
 * wash their own hue (`bg-success/15`, `bg-danger/10`), and `--ht-highlight` is
 * already translucent, so it washes at full strength.
 */
const NUDGED: Nudged[] = [
  { name: "ht-ink-muted", floor: 3 },
  { name: "ht-link", floor: 4.5, wash: { hue: "ht-link", alphas: [0.1] } },
  {
    name: "ht-success-ink",
    floor: 4.5,
    wash: { hue: "ht-success", alphas: [0.15, 0.1] },
  },
  {
    name: "ht-warning-ink",
    floor: 4.5,
    wash: { hue: "ht-warning", alphas: [0.15, 0.1] },
  },
  {
    name: "ht-danger-ink",
    floor: 4.5,
    wash: { hue: "ht-danger", alphas: [0.15, 0.1] },
  },
  {
    name: "ht-highlight-text",
    floor: 4.5,
    wash: { hue: "ht-highlight", alphas: [1] },
  },
];

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

    it(`Houston ${mode} swatches the link, the one colour it spends`, () => {
      // Houston's action is ink by doctrine, so its primary button is near-ink
      // in light and white frost in dark: a tile painted from that would be a
      // fourth gray beside three others. The link is the one place these two
      // sets spend colour on content, so it is what the tile shows. An import
      // has an accent and shows that instead.
      const houston = palettes.find((p) => p.id === `houston-${mode}`);
      expect(houston).toBeDefined();
      expect(parseColor(houston?.swatch.accent ?? "")).toEqual(
        parseColor(base[mode]["ht-link"]),
      );
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

  // Every composite the derivation guards, re-measured from the CSS: the four
  // plain rows, plus each wash over each of those rows. A regression at any one
  // of them is a role the user cannot read on a surface Houston paints it on.
  for (const { name, floor, wash } of NUDGED) {
    const washes: [string, Rgba][] = wash
      ? wash.alphas.flatMap((alpha) =>
          surfaces.map(([surfaceName, surface]): [string, Rgba] => [
            `${alpha * 100}% --${wash.hue} wash over the ${surfaceName}`,
            composite(withAlpha(vars[wash.hue], alpha), surface) as Rgba,
          ]),
        )
      : [];
    for (const [surfaceName, surface] of [...surfaces, ...washes]) {
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

  it("swatches the colour its primary button paints", () => {
    // The picker paints a tile from these four hexes and a filled pill from the
    // fourth, so that fourth hex has to be the colour the real button wears: the
    // accent, which IS `--ht-cta` in light and the hue the frost pill and its rim
    // carry in dark. Reading it off the palette's ACTION role instead let a
    // monochrome import (the `white` theme, whose accent is a gray) fall through
    // to Houston's blue link and show a blue pill over a gray button.
    const accent = parseColor(loadPalette(palette).accent) as Rgba;
    expect(parseColor(palette.swatch.accent)).toEqual(accent);
  });

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

  /**
   * Status is SEMANTICS, not surface, so the whole family and the link are
   * Houston's own, taken from the set of the same mode. A terminal palette's
   * red, green and yellow are what a shell prints error text in, and in the
   * `white` theme they are three grays: derived from those, a "Delete forever"
   * pill would be indistinguishable from a normal button and a resting link
   * would be plain black text.
   *
   * So the fills are inherited verbatim, and pinned here as the exact colours
   * they are. Only the roles worn AS TEXT climb THIS palette's ladder: they may
   * drift, but never off their family and never into a gray, which is what the
   * chroma floor is for. That the nudge kept them readable is what the contrast
   * matrix above proves.
   */
  it("inherits Houston's status fills unchanged", () => {
    for (const name of INHERITED) {
      expect(
        parseColor(vars[name]),
        `--${name} (${vars[name]}) moved off Houston ${palette.mode}'s ${expected[name]}`,
      ).toEqual(parseColor(expected[name]));
    }
  });

  it("nudges the status text onto its own ladder, never off the family", () => {
    for (const name of NUDGED_HUES) {
      const distance = hueDistance(vars[name], expected[name]) as number;
      expect(
        distance,
        `--${name} (${vars[name]}) sits ${distance}° from Houston ${palette.mode}'s ${expected[name]}`,
      ).toBeLessThanOrEqual(HUE_TOLERANCE);
      const chroma = saturation(vars[name]) as number;
      expect(
        chroma,
        `--${name} (${vars[name]}) carries ${chroma.toFixed(2)} saturation: a hue this washed out reads as gray`,
      ).toBeGreaterThanOrEqual(CHROMA_FLOOR);
    }
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
});
