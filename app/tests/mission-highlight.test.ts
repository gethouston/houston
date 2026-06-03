import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  extractSnippet,
  findHighlightRanges,
  foldForSearch,
} from "../src/components/mission-highlight.ts";

/** Slice each range out of the source text — handy for asserting WHAT got
 *  highlighted rather than just where. */
function highlighted(text: string, ranges: { start: number; end: number }[]): string[] {
  return ranges.map((r) => text.slice(r.start, r.end));
}

describe("foldForSearch", () => {
  it("lowercases and strips accents", () => {
    strictEqual(foldForSearch("São PAULO"), "sao paulo");
  });
});

describe("findHighlightRanges", () => {
  it("returns the original-text range of a simple match", () => {
    const ranges = findHighlightRanges("Budget review", ["budget"]);
    deepStrictEqual(ranges, [{ start: 0, end: 6 }]);
    deepStrictEqual(highlighted("Budget review", ranges), ["Budget"]);
  });

  it("matches case- and accent-insensitively but reports original spans", () => {
    const text = "Refresh São Paulo";
    const ranges = findHighlightRanges(text, ["sao"]);
    deepStrictEqual(highlighted(text, ranges), ["São"]);
  });

  it("merges overlapping term hits into one range", () => {
    const ranges = findHighlightRanges("budget", ["bud", "get", "budget"]);
    deepStrictEqual(ranges, [{ start: 0, end: 6 }]);
  });

  it("finds every occurrence of a term", () => {
    const text = "pay the invoice then resend the invoice";
    const ranges = findHighlightRanges(text, ["invoice"]);
    deepStrictEqual(highlighted(text, ranges), ["invoice", "invoice"]);
  });

  it("returns nothing when no term occurs", () => {
    deepStrictEqual(findHighlightRanges("nothing here", ["budget"]), []);
    deepStrictEqual(findHighlightRanges("", ["budget"]), []);
    deepStrictEqual(findHighlightRanges("text", []), []);
  });
});

describe("extractSnippet", () => {
  it("centers a fragment on the first match with ellipses on both clipped sides", () => {
    const text =
      "Discussed the launch timeline and staffing plan in great detail before turning to the quarterly budget review and then several other unrelated logistics items afterwards.";
    const snippet = extractSnippet(text, ["budget"]);
    strictEqual(snippet !== null, true);
    if (!snippet) return;
    strictEqual(snippet.text.startsWith("…"), true);
    strictEqual(snippet.text.endsWith("…"), true);
    strictEqual(snippet.text.toLowerCase().includes("budget"), true);
    deepStrictEqual(
      highlighted(snippet.text, snippet.ranges).map((s) => s.toLowerCase()),
      ["budget"],
    );
  });

  it("omits the leading ellipsis when the match is at the start", () => {
    const text = "budget owner is named here and the rest of the sentence keeps going onward";
    const snippet = extractSnippet(text, ["budget"]);
    strictEqual(snippet !== null, true);
    if (!snippet) return;
    strictEqual(snippet.text.startsWith("…"), false);
    deepStrictEqual(highlighted(snippet.text, snippet.ranges), ["budget"]);
  });

  it("returns null when no term occurs in the text", () => {
    strictEqual(extractSnippet("nothing matches in here", ["budget"]), null);
  });
});
