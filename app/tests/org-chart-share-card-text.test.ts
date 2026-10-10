import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  fitText,
  graphemes,
  type Measurer,
  wrapLines,
} from "../src/components/organization/org-chart-share-card-text.ts";

/** Ten units per user-perceived character, so the widths are exact. */
const ctx: Measurer = {
  font: "",
  measureText: (text) => ({ width: graphemes(text).length * 10 }),
};

const FAMILY = "👨‍👩‍👧";
const WAVE = "👋🏽";

describe("fitText", () => {
  it("keeps text that fits and cuts the rest with an ellipsis", () => {
    strictEqual(fitText(ctx, "Acme", 40), "Acme");
    strictEqual(fitText(ctx, "Acme Corp", 50), "Acme…");
  });

  it("never splits an emoji sequence or an accent before the ellipsis", () => {
    for (const max of [10, 20, 30, 40, 50, 60]) {
      const cut = fitText(ctx, `Ana ${FAMILY}${WAVE} Ruiz`, max);
      const kept = graphemes(cut);
      for (const g of kept)
        ok(
          !/^[‍\u{1f3fb}-\u{1f3ff}]/u.test(g),
          `a dangling joiner or skin tone in "${cut}"`,
        );
      ok(cut.endsWith("…"), cut);
      ok(!cut.includes("‍…"), cut);
    }
    // e + combining acute is one character.
    strictEqual(fitText(ctx, "José Maria", 50), "José…");
  });
});

describe("wrapLines", () => {
  it("breaks between words and cuts what runs past the last line", () => {
    deepStrictEqual(wrapLines(ctx, "Social Media Manager", 130, 2), [
      "Social Media",
      "Manager",
    ]);
    deepStrictEqual(wrapLines(ctx, "One two three four five six", 90, 2), [
      "One two",
      "three fo…",
    ]);
    deepStrictEqual(wrapLines(ctx, "Social Media Manager", 130, 1), [
      "Social Media…",
    ]);
  });

  it("wraps CJK, which has no spaces, between its words", () => {
    const lines = wrapLines(ctx, "東京営業部の部長代理", 50, 2);
    strictEqual(lines.length, 2);
    for (const line of lines) ok(graphemes(line).length <= 5, line);
    ok(!lines[0].endsWith("…"), lines[0]);
  });

  it("keeps an emoji whole when it wraps", () => {
    const lines = wrapLines(ctx, `Team ${FAMILY} rocks`, 60, 2);
    ok(
      lines.some((line) => line.includes(FAMILY)),
      lines.join("|"),
    );
  });
});
