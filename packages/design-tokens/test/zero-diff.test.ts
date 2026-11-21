import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs build helper, no type declarations needed here.
import { parseColor } from "../build/color.mjs";
import legacy from "./legacy-resolved.json" with { type: "json" };

const cssPath = fileURLToPath(
  new URL("../dist/css/tokens.css", import.meta.url),
);

type Vars = Record<string, string>;

function parseBlock(css: string, selector: string): Vars {
  const escaped = selector.replace(/[[\]"]/g, "\\$&");
  const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!block) throw new Error(`No ${selector} block in generated tokens.css`);
  const vars: Vars = {};
  const re = /--(ht-[a-z0-9-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null = re.exec(block[1]);
  while (m) {
    if (!m[1].startsWith("ht-shadow-")) vars[m[1]] = m[2].trim();
    m = re.exec(block[1]);
  }
  return vars;
}

const css = readFileSync(cssPath, "utf8");
const generated = {
  light: parseBlock(css, ":root"),
  dark: parseBlock(css, '[data-theme="dark"]'),
};

describe.each(["light", "dark"] as const)("zero visual diff (%s)", (theme) => {
  const baseline = legacy[theme] as Vars;
  const gen = generated[theme];

  it("defines exactly the legacy set of --ht-* variables", () => {
    expect(Object.keys(gen).sort()).toEqual(Object.keys(baseline).sort());
  });

  for (const [name, legacyValue] of Object.entries(baseline)) {
    it(`--${name} resolves to the same colour`, () => {
      expect(gen[name], `missing --${name}`).toBeDefined();
      expect(parseColor(gen[name])).toEqual(parseColor(legacyValue));
    });
  }
});
