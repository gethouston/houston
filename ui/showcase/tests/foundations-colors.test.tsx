import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import darkTokens from "../../../packages/design-tokens/tokens/semantic/color.dark.json";
import lightTokens from "../../../packages/design-tokens/tokens/semantic/color.light.json";
import {
  COLOR_TOKEN_GROUPS,
  COLOR_TOKEN_NAMES,
  describeToken,
} from "../specimens/foundations/color-tokens.ts";
import { COLOR_VOCABULARY } from "../specimens/foundations/color-vocabulary.ts";
import { specimen } from "../specimens/foundations/colors.tsx";
import { EFFECT_DISCLAIMER } from "../specimens/foundations/effects-parts.ts";
import { displayValue } from "../specimens/foundations/use-live-theme.ts";

/**
 * Every `--ht-*` token, read straight out of the token JSON rather than out of
 * the page's own flattener — so this file and the page have to agree by
 * arriving at the same answer independently, not by sharing the mistake.
 */
function tokenNames(file: unknown): string[] {
  const found: string[] = [];
  const walk = (node: Record<string, unknown>, prefix: string[]) => {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("$") || typeof value !== "object" || value === null)
        continue;
      const child = value as Record<string, unknown>;
      const path = [...prefix, key];
      if ("$value" in child) found.push(path.join("-"));
      else walk(child, path);
    }
  };
  walk((file as { ht: Record<string, unknown> }).ht, []);
  return found.sort();
}

const LIGHT = tokenNames(lightTokens);

describe("the Colors page", () => {
  // The whole promise of the page: the palette can grow, shrink or be renamed
  // in `packages/design-tokens`, and this page tells the truth about it the
  // next time it renders — no second list to remember to update.
  it("shows every semantic colour token the design tokens declare", () => {
    const html = renderToStaticMarkup(specimen.render());
    for (const name of LIGHT) {
      assert.ok(
        html.includes(`--ht-${name}`),
        `--ht-${name} is a semantic colour token and does not appear on the Colors page`,
      );
    }
  });

  it("enumerates the tokens from the JSON, in the JSON's own order", () => {
    assert.deepEqual([...COLOR_TOKEN_NAMES].sort(), LIGHT);
    assert.deepEqual(tokenNames(darkTokens), LIGHT, "the two themes disagree");
  });

  it("files every token under exactly one block", () => {
    const filed = COLOR_TOKEN_GROUPS.flatMap((group) =>
      group.tokens.map((token) => token.name),
    );
    assert.deepEqual(
      filed.filter((name, index) => filed.indexOf(name) !== index),
      [],
      "a token is filed under two blocks — it would render twice",
    );
    assert.deepEqual([...filed].sort(), LIGHT);
    for (const group of COLOR_TOKEN_GROUPS) {
      assert.notEqual(group.tokens.length, 0, group.title);
    }
  });

  it("names the tokens a designer actually says out loud", () => {
    assert.equal(describeToken("base").label, "Gutter");
    assert.equal(describeToken("line").label, "Line");
    // The vocabulary may lag the palette, but it may never lead it: a word for
    // a token that no longer exists is a word nobody will ever read again.
    for (const name of Object.keys(COLOR_VOCABULARY)) {
      assert.ok(LIGHT.includes(name), `${name} is not a semantic colour token`);
    }
  });

  it("falls back to a prettified name so a new token never vanishes", () => {
    const fresh = describeToken("brand-new-token");
    assert.equal(fresh.label, "Brand new token");
    assert.equal(fresh.variable, "--ht-brand-new-token");
    assert.match(fresh.role, /color-vocabulary/);
  });

  it("marks both canvas effects as effects, not tokens", () => {
    const html = renderToStaticMarkup(specimen.render());
    const disclaimers = html.split(EFFECT_DISCLAIMER).length - 1;
    assert.equal(disclaimers, 2, "Aurora and Glass each carry the line");
    assert.ok(html.includes("dark only"), "the aurora's light-mode note");
  });
});

describe("the live value", () => {
  // What a browser hands back for a resolved colour is `rgb(...)`; what a
  // designer reads, types and pastes is a hex. Everything else is left exactly
  // as the stylesheet wrote it — the alpha in a glass token is information.
  it("converts an opaque rgb to hex and leaves everything else alone", () => {
    assert.equal(displayValue("rgb(238, 241, 247)"), "#eef1f7");
    assert.equal(displayValue("  rgb(20 20 22)  "), "#141416");
    assert.equal(
      displayValue("rgba(255, 255, 255, 0.68)"),
      "rgba(255, 255, 255, 0.68)",
    );
    assert.equal(displayValue("#eef1f7"), "#eef1f7");
    assert.equal(displayValue("transparent"), "transparent");
    assert.equal(displayValue(""), "");
  });
});
