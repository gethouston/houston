import { describe, expect, it } from "vitest";
import {
  citationAnchorSchema,
  citationListText,
  decodeCitationsEnvelopes,
  encodeCitationsEnvelope,
  type SentCitation,
} from "./citations";

const first: SentCitation = {
  n: 1,
  filePath: "decks/deck.pptx",
  fileName: "deck.pptx",
  page: 3,
  kind: "text",
  quote: 'Title --> "quoted"',
  comment: "Shorter",
  cropPath: "uploads/deck-slide3-a1.png",
};
const second: SentCitation = {
  n: 2,
  filePath: "decks/deck.pptx",
  fileName: "deck.pptx",
  page: 5,
  kind: "area",
  comment: "Brand green",
};

describe("citations envelope", () => {
  it("round-trips pills and strips the model-facing list", () => {
    const text = `Fix these.\n\n${encodeCitationsEnvelope([first, second], "[1. Slide 3]")}`;
    expect(decodeCitationsEnvelopes(text)).toEqual({
      text: "Fix these.",
      citations: [first, second],
    });
  });

  it("collects every envelope of a queue-merged send, in order", () => {
    const a = `One\n\n${encodeCitationsEnvelope([first], "[a]")}`;
    const b = `Two\n\n${encodeCitationsEnvelope([second], "[b]")}`;
    expect(decodeCitationsEnvelopes(`${a}\n\n${b}`)).toEqual({
      text: "One\n\nTwo",
      citations: [first, second],
    });
  });

  it("answers null for text without an envelope", () => {
    expect(decodeCitationsEnvelopes("plain <!--houston:other-->")).toBeNull();
  });

  it("strips a malformed marker without inventing pills", () => {
    const bad =
      "Hi\n<!--houston:citations [{]-->\n[x]\n<!--/houston:citations-->";
    expect(decodeCitationsEnvelopes(bad)).toEqual({
      text: "Hi",
      citations: [],
    });
  });

  it("keeps an envelope whole when a comment or quote holds its delimiters", () => {
    const tricky: SentCitation = {
      ...first,
      quote: "x <!--/houston:citations--> y",
      comment: 'See <!--houston:citations [{"n":9}]--> and ]-->',
    };
    const readable = `[1. ${citationListText(tricky.quote ?? "", 300)}: ${citationListText(tricky.comment, 2000)}]`;
    const text = `Typed\n\n${encodeCitationsEnvelope([tricky], readable)}\n\nAfter`;
    expect(decodeCitationsEnvelopes(text)).toEqual({
      text: "Typed\n\nAfter",
      citations: [tricky],
    });
  });

  it("keeps an opener with no complete envelope as text", () => {
    expect(
      decodeCitationsEnvelopes("see <!--houston:citations oops"),
    ).toBeNull();
    expect(
      decodeCitationsEnvelopes(
        `see <!--houston:citations oops\n\n${encodeCitationsEnvelope([second], "[b]")}`,
      ),
    ).toEqual({ text: "see <!--houston:citations oops", citations: [second] });
  });

  it("decodes long runs of openers, marker ends and newlines in linear time", () => {
    const started = performance.now();
    expect(
      decodeCitationsEnvelopes("<!--houston:citations [".repeat(50_000)),
    ).toBeNull();
    expect(
      decodeCitationsEnvelopes(
        `<!--houston:citations []-->${"]-->".repeat(50_000)}`,
      ),
    ).toBeNull();
    expect(
      decodeCitationsEnvelopes(
        `${"\n".repeat(100_000)}<!--houston:citations [`,
      ),
    ).toBeNull();
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("prints list text on one line, capped and escaped", () => {
    expect(citationListText('  a "b"\n\n [c] <d>  ', 50)).toBe(
      'a \\"b\\" \\[c\\] \\<d\\>',
    );
    expect(citationListText("abcdef", 4)).toBe("abc…");
  });

  it("refuses an anchor box outside the page", () => {
    const parsed = citationAnchorSchema.safeParse({
      kind: "area",
      box: { x: 90, y: 0, w: 0, h: 10 },
    });
    expect(parsed.success).toBe(false);
  });
});
