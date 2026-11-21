import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs build helper, no type declarations needed here.
import { parseColor } from "../build/color.mjs";

const CONTRAST_FLOOR = 4.5;
const NON_TEXT_CONTRAST_FLOOR = 3;

const cssPath = fileURLToPath(
  new URL("../dist/css/tokens.css", import.meta.url),
);

type Rgba = { r: number; g: number; b: number; a: number };
type Vars = Record<string, string>;

function parseBlock(css: string, selector: string): Vars {
  const escaped = selector.replace(/[[\]"]/g, "\\$&");
  const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!block) throw new Error(`No ${selector} block in generated tokens.css`);
  const vars: Vars = {};
  const re = /--(ht-[a-z0-9-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null = re.exec(block[1]);
  while (m) {
    vars[m[1]] = m[2].trim();
    m = re.exec(block[1]);
  }
  return vars;
}

function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a + bg.a * (1 - fg.a);
  const mix = (f: number, b: number) =>
    (f * fg.a + b * bg.a * (1 - fg.a)) / (a || 1);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a };
}

function relativeLuminance({ r, g, b }: Rgba): number {
  const lin = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync(cssPath, "utf8");
const themes = {
  light: parseBlock(css, ":root"),
  dark: parseBlock(css, '[data-theme="dark"]'),
} as const;

type Theme = keyof typeof themes;

function token(theme: Theme, name: string): Rgba {
  const raw = themes[theme][name];
  if (raw === undefined) {
    throw new Error(`--${name} is not defined in the ${theme} theme`);
  }
  return parseColor(raw) as Rgba;
}

function nameSurface(theme: Theme): Rgba {
  return over(token(theme, "ht-background"), token(theme, "ht-base"));
}

function bubbleSurface(theme: Theme): Rgba {
  return over(token(theme, "ht-chip"), nameSurface(theme));
}

function contentSurface(theme: Theme, name: string): Rgba {
  return name === "ht-background"
    ? nameSurface(theme)
    : over(token(theme, name), nameSurface(theme));
}

const PERSON_TONES = ["slate", "sage", "mauve", "taupe", "indigo"] as const;
const FILETYPE_FAMILIES = [
  "pdf",
  "doc",
  "sheet",
  "slide",
  "image",
  "video",
  "audio",
  "archive",
  "code",
  "generic",
] as const;

const STATUS_INKS = ["success", "warning", "danger"] as const;

const STATUS_WASH_ALPHAS = [0.15, 0.1] as const;

function washSurface(
  theme: Theme,
  status: (typeof STATUS_INKS)[number],
  alpha: number,
  surfaceToken: string,
): Rgba {
  const hue = token(theme, `ht-${status}`);
  return over(
    { ...hue, a: hue.a * alpha },
    contentSurface(theme, surfaceToken),
  );
}

function buttonSurfaces(theme: Theme): [string, Rgba][] {
  return [
    ["pane", contentSurface(theme, "ht-input")],
    ["gutter", token(theme, "ht-base")],
  ];
}

const ORG_TONES = [
  "teal",
  "purple",
  "orange",
  "navy",
  "rose",
  "forest",
  "crimson",
] as const;

function dialogChipSurface(theme: Theme): Rgba {
  return over(token(theme, "ht-chip"), token(theme, "ht-dialog"));
}

const AGENT_TONES = [
  "charcoal",
  "forest",
  "navy",
  "purple",
  "crimson",
  "orange",
  "golden",
  "teal",
  "rose",
  "umber",
] as const;

describe.each([
  "light",
  "dark",
] as const)("name text contrast (%s)", (theme) => {
  it("composites both surfaces to fully opaque colours", () => {
    expect(token(theme, "ht-base").a).toBe(1);
    expect(nameSurface(theme).a).toBe(1);
    expect(bubbleSurface(theme).a).toBe(1);
  });

  for (const tone of PERSON_TONES) {
    it(`person name tone "${tone}" clears ${CONTRAST_FLOOR}:1 on the bubble`, () => {
      const ratio = contrastRatio(
        token(theme, `ht-person-name-${tone}`),
        bubbleSurface(theme),
      );
      expect(
        ratio,
        `--ht-person-name-${tone} (${theme}) measures ${ratio.toFixed(2)}:1 on the chat bubble, below the ${CONTRAST_FLOOR}:1 body-text floor`,
      ).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
    });
  }

  for (const family of FILETYPE_FAMILIES) {
    it(`file-type tint "${family}" clears ${CONTRAST_FLOOR}:1 on its tile`, () => {
      const surface = contentSurface(theme, "ht-input");
      const ratio = contrastRatio(
        over(token(theme, `ht-filetype-${family}`), surface),
        surface,
      );
      expect(
        ratio,
        `--ht-filetype-${family} (${theme}) measures ${ratio.toFixed(2)}:1 on the icon tile, below the ${CONTRAST_FLOOR}:1 floor`,
      ).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
    });

    for (const [surfaceName, tokenName] of [
      ["page", "ht-background"],
      ["checked row", "ht-chip-subtle"],
    ] as const) {
      it(`file-type tint "${family}" clears ${NON_TEXT_CONTRAST_FLOOR}:1 on the ${surfaceName}`, () => {
        const surface = contentSurface(theme, tokenName);
        const ratio = contrastRatio(
          over(token(theme, `ht-filetype-${family}`), surface),
          surface,
        );
        expect(
          ratio,
          `--ht-filetype-${family} (${theme}) measures ${ratio.toFixed(2)}:1 on the ${surfaceName}, below the ${NON_TEXT_CONTRAST_FLOOR}:1 non-text floor`,
        ).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST_FLOOR);
      });
    }
  }

  for (const status of STATUS_INKS) {
    for (const [surfaceName, tokenName] of [
      ["field", "ht-input"],
      ["page", "ht-background"],
      ["recessed row", "ht-chip-subtle"],
    ] as const) {
      it(`status ink "${status}" clears ${CONTRAST_FLOOR}:1 on the ${surfaceName}`, () => {
        const surface = contentSurface(theme, tokenName);
        const ratio = contrastRatio(
          over(token(theme, `ht-${status}-ink`), surface),
          surface,
        );
        expect(
          ratio,
          `--ht-${status}-ink (${theme}) measures ${ratio.toFixed(2)}:1 on the ${surfaceName}, below the ${CONTRAST_FLOOR}:1 body-text floor`,
        ).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
      });
    }

    for (const alpha of STATUS_WASH_ALPHAS) {
      for (const [surfaceName, tokenName] of [
        ["field", "ht-input"],
        ["page", "ht-background"],
        ["chip row", "ht-chip"],
      ] as const) {
        it(`status ink "${status}" clears ${CONTRAST_FLOOR}:1 on its own ${alpha * 100}% wash over the ${surfaceName}`, () => {
          const surface = washSurface(theme, status, alpha, tokenName);
          const ratio = contrastRatio(
            over(token(theme, `ht-${status}-ink`), surface),
            surface,
          );
          expect(
            ratio,
            `--ht-${status}-ink (${theme}) measures ${ratio.toFixed(2)}:1 on a ${alpha * 100}% --ht-${status} wash over the ${surfaceName}, below the ${CONTRAST_FLOOR}:1 body-text floor`,
          ).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
        });
      }
    }
  }

  for (const status of STATUS_INKS) {
    for (const alpha of STATUS_WASH_ALPHAS) {
      it(`status ink "${status}" clears ${CONTRAST_FLOOR}:1 on its own ${alpha * 100}% wash over a row in a dialog`, () => {
        const hue = token(theme, `ht-${status}`);
        const surface = over(
          { ...hue, a: hue.a * alpha },
          dialogChipSurface(theme),
        );
        const ratio = contrastRatio(
          over(token(theme, `ht-${status}-ink`), surface),
          surface,
        );
        expect(
          ratio,
          `--ht-${status}-ink (${theme}) measures ${ratio.toFixed(2)}:1 on a ${alpha * 100}% --ht-${status} wash over a dialog row, below the ${CONTRAST_FLOOR}:1 body-text floor`,
        ).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
      });
    }
  }

  for (const tone of ORG_TONES) {
    for (const stop of [tone, `${tone}-deep`]) {
      it(`org avatar stop "${stop}" carries its initials at ${CONTRAST_FLOOR}:1`, () => {
        const ratio = contrastRatio(
          token(theme, "ht-org-initials"),
          token(theme, `ht-org-${stop}`),
        );
        expect(
          ratio,
          `--ht-org-initials (${theme}) measures ${ratio.toFixed(2)}:1 on --ht-org-${stop}, below the ${CONTRAST_FLOOR}:1 body-text floor`,
        ).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
      });
    }
  }

  for (const [surfaceName, surface] of [
    ["field", contentSurface(theme, "ht-input")],
    ["page", contentSurface(theme, "ht-background")],
    ["recessed row", contentSurface(theme, "ht-chip-subtle")],
    ["chat bubble", bubbleSurface(theme)],
  ] as [string, Rgba][]) {
    it(`the link colour clears ${CONTRAST_FLOOR}:1 on the ${surfaceName}`, () => {
      const ratio = contrastRatio(token(theme, "ht-link"), surface);
      expect(
        ratio,
        `--ht-link (${theme}) measures ${ratio.toFixed(2)}:1 on the ${surfaceName}, below the ${CONTRAST_FLOOR}:1 body-text floor`,
      ).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
    });
  }

  for (const [surfaceName, surface] of buttonSurfaces(theme)) {
    it(`the primary button's label clears ${CONTRAST_FLOOR}:1 over the ${surfaceName}`, () => {
      const fill = over(token(theme, "ht-cta"), surface);
      const ratio = contrastRatio(
        over(token(theme, "ht-cta-text"), fill),
        fill,
      );
      expect(
        ratio,
        `--ht-cta-text (${theme}) measures ${ratio.toFixed(2)}:1 on --ht-cta over the ${surfaceName}, below the ${CONTRAST_FLOOR}:1 body-text floor`,
      ).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
    });
  }

  for (const tone of AGENT_TONES) {
    it(`agent tone "${tone}" clears ${CONTRAST_FLOOR}:1 as a name`, () => {
      const ratio = contrastRatio(
        token(theme, `ht-agent-${tone}`),
        nameSurface(theme),
      );
      expect(
        ratio,
        `--ht-agent-${tone} (${theme}) measures ${ratio.toFixed(2)}:1 on the name surface, below the ${CONTRAST_FLOOR}:1 body-text floor`,
      ).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
    });
  }
});
