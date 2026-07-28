import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { foldForSearch } from "../src/components/mission-highlight.ts";
import {
  matchesSearchable,
  snippetFor,
  toSearchableText,
} from "../src/components/mission-search-text.ts";

describe("toSearchableText", () => {
  it("keeps the original for display and folds it once for matching", () => {
    const source = toSearchableText("Refresh São Paulo budget");
    strictEqual(source.text, "Refresh São Paulo budget");
    strictEqual(source.folded, "refresh sao paulo budget");
  });
});

describe("matchesSearchable", () => {
  it("matches the pre-folded text without re-folding it", () => {
    const source = toSearchableText("Refresh São Paulo budget");
    strictEqual(matchesSearchable(source, "sao paulo"), true);
    strictEqual(matchesSearchable(source, "budget"), true);
    strictEqual(matchesSearchable(source, "paulo refresh"), false);
  });

  it("agrees with matching over a transcript-shaped body", () => {
    const source = toSearchableText(
      ["Send the invoice", 'Grep {"pattern":"invoice"}', "Invoice sent"].join(
        "\n",
      ),
    );
    strictEqual(matchesSearchable(source, "invoice sent"), true);
    // Messages are newline-joined, and a phrase's flexible whitespace spans
    // that boundary — but scattered words still never match.
    strictEqual(matchesSearchable(source, "invoice grep"), true);
    strictEqual(matchesSearchable(source, "send invoice"), false);
  });
});

describe("snippetFor", () => {
  const transcript = [
    "Kicked off the launch checklist and assigned the owners.",
    "Then we reviewed the quarterly budget for São Paulo before moving on.",
    "Finally we scheduled the retro for next week.",
  ].join("\n");

  it("cuts the snippet from the ORIGINAL message, accents intact", () => {
    const snippet = snippetFor(toSearchableText(transcript), "sao paulo");
    strictEqual(snippet !== null, true);
    if (!snippet) return;
    strictEqual(snippet.text.includes("São Paulo"), true);
    // Only the matching line, never the neighbouring messages.
    strictEqual(snippet.text.includes("retro"), false);
    strictEqual(snippet.text.includes("checklist"), false);
    deepStrictEqual(
      snippet.ranges.map((r) => snippet.text.slice(r.start, r.end)),
      ["São Paulo"],
    );
  });

  it("spans the messages a flexible-whitespace phrase straddles", () => {
    const source = toSearchableText("ask about this\nmonth end totals");
    const snippet = snippetFor(source, "this month");
    strictEqual(snippet !== null, true);
    if (!snippet) return;
    deepStrictEqual(
      snippet.ranges
        .map((r) => snippet.text.slice(r.start, r.end))
        .map((s) => s.replace(/\s+/g, " ")),
      ["this month"],
    );
  });

  it("finds a match on the last line of a long transcript", () => {
    const long = [
      ...Array.from({ length: 400 }, (_, i) => `Routine status update ${i}`),
      "The vendor contract is attached here.",
    ].join("\n");
    const source = toSearchableText(long);
    // Fold happened once, up front: matching only reads the cached fold.
    strictEqual(source.folded, foldForSearch(long));
    const snippet = snippetFor(source, "vendor contract");
    strictEqual(snippet !== null, true);
    if (!snippet) return;
    strictEqual(snippet.text.includes("vendor contract"), true);
    strictEqual(snippet.text.includes("Routine status"), false);
  });

  it("is null when the phrase does not occur", () => {
    strictEqual(snippetFor(toSearchableText(transcript), "invoice"), null);
    strictEqual(snippetFor(toSearchableText(""), "invoice"), null);
  });
});
