import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs build helper, no type declarations needed here.
import { parseColor } from "../build/color.mjs";

/**
 * WCAG guard for every colour family Houston paints as IDENTITY, where a
 * washed-out hue is not a style slip but unreadable information: the two
 * families that carry a sender's NAME in chat, and the file-type tints the
 * Files list paints its icon glyphs with.
 *
 * Chat attributes every message to its sender WhatsApp-group style: the name
 * renders inside the bubble in that sender's stable tone. Text has to clear
 * 4.5:1, and a fill tuned to carry white initials does not automatically do so
 * — the `person.*` avatar fills measure 2.9-3.1:1 as dark-mode text, which is
 * exactly why the `person.name-*` variants exist.
 *
 * The surfaces are composited from the REAL tokens rather than pinned to a
 * literal, so if the bubble or canvas ever moves, this test re-measures against
 * the new surface instead of quietly guarding a stale one:
 *
 *   name surface (agent names)  light: background
 *                               dark:  background over base
 *   bubble surface (person)     light: chip over background
 *                               dark:  chip over background over base
 *
 *   icon tile (file types)      both:  --ht-input, opaque in either theme
 *
 * Values are read from the generated CSS (the same artifact the app ships), so
 * a token edit that regresses contrast fails here rather than in someone's eyes.
 */

const CONTRAST_FLOOR = 4.5;

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

/** Source-over alpha compositing in sRGB space, matching how a browser paints. */
function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a + bg.a * (1 - fg.a);
  const mix = (f: number, b: number) =>
    (f * fg.a + b * bg.a * (1 - fg.a)) / (a || 1);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a };
}

/** WCAG 2.x relative luminance from sRGB components in [0, 1]. */
function relativeLuminance({ r, g, b }: Rgba): number {
  const lin = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.x contrast ratio; both colours must already be opaque. */
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

/** The canvas an agent name sits on: the screen surface, flattened onto the gutter. */
function nameSurface(theme: Theme): Rgba {
  return over(token(theme, "ht-background"), token(theme, "ht-base"));
}

/** The chat bubble a teammate's name sits in: the chip recess over that canvas. */
function bubbleSurface(theme: Theme): Rgba {
  return over(token(theme, "ht-chip"), nameSurface(theme));
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
    // The ladder bottoms out at an opaque gutter; if it ever stops doing so,
    // every ratio below would be measured against a colour that does not exist.
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
      // The Files icon tile is filled with --ht-input in both themes, and the
      // glyph is the only thing inside it: a tint that fails here is a file
      // type the user cannot read at a glance.
      const ratio = contrastRatio(
        token(theme, `ht-filetype-${family}`),
        token(theme, "ht-input"),
      );
      expect(
        ratio,
        `--ht-filetype-${family} (${theme}) measures ${ratio.toFixed(2)}:1 on the icon tile, below the ${CONTRAST_FLOOR}:1 floor`,
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
