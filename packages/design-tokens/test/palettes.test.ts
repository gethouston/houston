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

const HUE_TOLERANCE = 20;

const CHROMA_FLOOR = 0.25;

const NUDGED_HUES = [
  "ht-danger-ink",
  "ht-success-ink",
  "ht-warning-ink",
  "ht-link",
  "ht-highlight-text",
] as const;

const INHERITED = [
  "ht-danger",
  "ht-danger-fill",
  "ht-danger-ring",
  "ht-success",
  "ht-warning",
  "ht-highlight",
] as const;

type Nudged = {
  name: string;
  floor: number;
  wash?: { hue: string; alphas: number[] };
};

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
    const accent = parseColor(loadPalette(palette).accent) as Rgba;
    expect(parseColor(palette.swatch.accent)).toEqual(accent);
  });

  it("wears its own accent as the action colour and the focus ring", () => {
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
