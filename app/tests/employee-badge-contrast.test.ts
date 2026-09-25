import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  contrastRatio,
  flattenColor,
  formatColor,
  parseColor,
} from "../../ui/core/src/color-contrast.ts";
import { employeeMetalColors } from "../../ui/core/src/employee-metal.ts";

const css = readFileSync(
  new URL("../../packages/design-tokens/dist/css/tokens.css", import.meta.url),
  "utf8",
);

function themeColors(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  ok(start >= 0, selector);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...block.matchAll(/--ht-([\w-]+):\s*([^;]+);/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

function overlay(color: string, alpha: number, background: string): string {
  return formatColor(
    flattenColor({ ...parseColor(color), a: alpha }, parseColor(background)),
  );
}

describe("employee badge identity contrast", () => {
  for (const selector of [":root", '[data-theme="dark"]']) {
    const colors = themeColors(selector);
    const palette = Object.entries(colors).filter(([name]) =>
      name.startsWith("agent-"),
    );

    it(`${selector}: metal relief and painter stay legible across the finish`, (context) => {
      strictEqual(palette.length, 10);
      const ratios = palette.flatMap(([name, paint]) => {
        const metal = employeeMetalColors(
          paint,
          colors["employee-metal-light"],
          colors["employee-metal-shade"],
          overlay,
        );
        const surfaces = [
          metal.top,
          metal.bottom,
          metal.sheen,
          metal.engraving,
          metal.control,
        ];
        return surfaces.flatMap((surface) => {
          const label = contrastRatio(metal.relief, surface);
          const dimmed = contrastRatio(
            overlay(metal.relief, 0.7, surface),
            surface,
          );
          ok(label >= 4.5, `${name} painter/helmet: ${label}`);
          ok(dimmed >= 3, `${name} joining helmet: ${dimmed}`);
          const hover = contrastRatio(
            overlay(metal.relief, 0.8, surface),
            surface,
          );
          ok(hover >= 3, `${name} hovered painter: ${hover}`);
          return [label];
        });
      });
      context.diagnostic(
        `Minimum metal text contrast: ${Math.min(...ratios).toFixed(2)}:1`,
      );
    });

    it(`${selector}: every avatar helmet clears 3:1 on its disc`, (context) => {
      strictEqual(palette.length, 10);
      const identities: [string, string][] = [
        ...palette,
        ["ink-muted", colors["ink-muted"]],
      ];
      const ratios = identities.flatMap(([name, paint]) => {
        const metal = employeeMetalColors(
          paint,
          colors["employee-metal-light"],
          colors["employee-metal-shade"],
          overlay,
        );
        return [metal.top, metal.bottom].map((disc) => {
          const ratio = contrastRatio(metal.relief, disc);
          ok(ratio >= 3, `${name} avatar helmet: ${ratio}`);
          return ratio;
        });
      });
      context.diagnostic(
        `Minimum avatar helmet contrast: ${Math.min(...ratios).toFixed(2)}:1`,
      );
    });

    it(`${selector}: every selected swatch clears 3:1`, (context) => {
      strictEqual(palette.length, 10);
      const ratios = palette.flatMap(([name, paint]) => {
        const check = contrastRatio(
          paint,
          selector === ":root" ? colors["bubble-text"] : colors.base,
        );
        ok(check >= 3, `${name} check: ${check}`);
        return [check];
      });
      context.diagnostic(
        `Minimum identity contrast: ${Math.min(...ratios).toFixed(2)}:1`,
      );
    });

    it(`${selector}: badge text and field labels clear 4.5:1 for all colors`, (context) => {
      const ratios = palette.flatMap(([name, paint]) => {
        const body = overlay(paint, 0.05, colors["card-solid"]);
        const title = contrastRatio(colors.ink, body);
        const field = contrastRatio(colors.ink, colors.input);
        const label = contrastRatio(
          overlay(colors.ink, 0.7, colors.input),
          colors.input,
        );
        for (const ratio of [title, field, label]) {
          ok(ratio >= 4.5, `${name}: ${ratio}`);
        }
        return [title, field, label];
      });
      context.diagnostic(
        `Minimum text contrast: ${Math.min(...ratios).toFixed(2)}:1`,
      );
    });
  }
});
