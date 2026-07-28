import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  extractSnippet,
  findFoldedMatch,
  findHighlightRanges,
  foldForSearch,
  matchesPhrase,
} from "../src/components/mission-highlight.ts";

/** Slice each range out of the source text — asserts WHAT got highlighted. */
function highlighted(
  text: string,
  ranges: { start: number; end: number }[],
): string[] {
  return ranges.map((r) => text.slice(r.start, r.end));
}

const COMBINING_MARKS = /[̀-ͯ]/g;

/** The per-CHARACTER fold `foldForSearch` used to be (HOU-941 replaced it with
 *  a single whole-string pass). Kept here as the reference implementation the
 *  fast fold must agree with. */
function foldPerChar(text: string): string {
  let folded = "";
  for (let i = 0; i < text.length; i++) {
    folded += text[i]
      .normalize("NFKD")
      .replace(COMBINING_MARKS, "")
      .toLowerCase();
  }
  return folded;
}

describe("foldForSearch", () => {
  it("lowercases and strips accents", () => {
    strictEqual(foldForSearch("São PAULO"), "sao paulo");
  });

  it("keeps the semantics of the per-character fold it replaced", () => {
    const corpus = [
      "São PAULO", // precomposed accents
      "noël", // decomposed accent (base + combining mark)
      "ÉLAN vital",
      "Straße", // no case folding of ß, by design
      "ﬁle ﬂow", // NFKD-expanded ligatures
      "½ cup", // NFKD-expanded fraction
      "ｈｅｌｌｏ", // NFKD-expanded fullwidth
      "İstanbul", // uppercase dotted I: NFKD + lowercase
      "Ǆungla", // a single char folding to more than one
      "🙂 emoji", // surrogate pairs survive intact
      "",
    ];
    for (const value of corpus) {
      strictEqual(foldForSearch(value), foldPerChar(value), value);
    }
  });
});

describe("findFoldedMatch", () => {
  it("locates the phrase in ALREADY-folded text", () => {
    const folded = foldForSearch("Refresh São Paulo budget");
    deepStrictEqual(findFoldedMatch(folded, "sao paulo"), {
      start: 8,
      end: 17,
    });
  });

  it("spans flexible whitespace and reports null when absent", () => {
    const folded = foldForSearch("do this\nmonth now");
    const match = findFoldedMatch(folded, "this month");
    strictEqual(match !== null, true);
    strictEqual(folded.slice(match?.start, match?.end), "this\nmonth");
    strictEqual(findFoldedMatch(folded, "next month"), null);
    strictEqual(findFoldedMatch("", "budget"), null);
    strictEqual(findFoldedMatch("text", ""), null);
  });
});

describe("matchesPhrase", () => {
  it("matches case- and accent-insensitively", () => {
    strictEqual(matchesPhrase("Refresh São Paulo budget", "sao paulo"), true);
    strictEqual(matchesPhrase("THIS MONTH", "this month"), true);
  });

  it("requires the words to be contiguous (a phrase, not scattered)", () => {
    strictEqual(matchesPhrase("plan this month", "this month"), true);
    strictEqual(matchesPhrase("this plan and next month", "this month"), false);
  });

  it("treats any run of whitespace between words as flexible", () => {
    strictEqual(matchesPhrase("do this\nmonth now", "this month"), true);
    strictEqual(matchesPhrase("this   month", "this month"), true);
  });

  it("is false for empty text or empty phrase", () => {
    strictEqual(matchesPhrase(undefined, "x"), false);
    strictEqual(matchesPhrase("text", ""), false);
  });
});

describe("findHighlightRanges", () => {
  it("returns the original-text range of a single-word match", () => {
    const ranges = findHighlightRanges("Budget review", "budget");
    deepStrictEqual(ranges, [{ start: 0, end: 6 }]);
    deepStrictEqual(highlighted("Budget review", ranges), ["Budget"]);
  });

  it("matches case/accent-insensitively but reports original spans", () => {
    const text = "Refresh São Paulo";
    const ranges = findHighlightRanges(text, "sao");
    deepStrictEqual(highlighted(text, ranges), ["São"]);
  });

  it("highlights a multi-word phrase contiguously, not scattered words", () => {
    const text = "Plan this month and skip next month";
    const ranges = findHighlightRanges(text, "this month");
    deepStrictEqual(highlighted(text, ranges), ["this month"]);
  });

  it("highlights across flexible whitespace", () => {
    const text = "do this\nmonth ok";
    const ranges = findHighlightRanges(text, "this month");
    strictEqual(ranges.length, 1);
    strictEqual(
      highlighted(text, ranges)[0].replace(/\s+/g, " "),
      "this month",
    );
  });

  it("finds every occurrence of the phrase", () => {
    const text = "this month then this month again";
    const ranges = findHighlightRanges(text, "this month");
    deepStrictEqual(highlighted(text, ranges), ["this month", "this month"]);
  });

  it("returns nothing when the phrase is absent", () => {
    deepStrictEqual(
      findHighlightRanges("this plan next month", "this month"),
      [],
    );
    deepStrictEqual(findHighlightRanges("", "budget"), []);
    deepStrictEqual(findHighlightRanges("text", ""), []);
  });
});

describe("extractSnippet", () => {
  it("centers a fragment on the first match with ellipses on both clipped sides", () => {
    const text =
      "Discussed the launch timeline and staffing plan in great detail before turning to the quarterly budget review and then several other unrelated logistics items afterwards.";
    const snippet = extractSnippet(text, "budget");
    strictEqual(snippet !== null, true);
    if (!snippet) return;
    strictEqual(snippet.text.startsWith("…"), true);
    strictEqual(snippet.text.endsWith("…"), true);
    deepStrictEqual(
      highlighted(snippet.text, snippet.ranges).map((s) => s.toLowerCase()),
      ["budget"],
    );
  });

  it("highlights the full multi-word phrase inside the snippet", () => {
    const text =
      "We should revisit the plan for this month before the team meets again next week.";
    const snippet = extractSnippet(text, "this month");
    strictEqual(snippet !== null, true);
    if (!snippet) return;
    deepStrictEqual(
      highlighted(snippet.text, snippet.ranges).map((s) => s.toLowerCase()),
      ["this month"],
    );
  });

  it("omits the leading ellipsis when the match is at the start", () => {
    const text =
      "budget owner is named here and the rest of the sentence keeps going onward";
    const snippet = extractSnippet(text, "budget");
    strictEqual(snippet !== null, true);
    if (!snippet) return;
    strictEqual(snippet.text.startsWith("…"), false);
    deepStrictEqual(highlighted(snippet.text, snippet.ranges), ["budget"]);
  });

  it("returns null when the phrase does not occur", () => {
    strictEqual(extractSnippet("nothing matches in here", "budget"), null);
  });
});
