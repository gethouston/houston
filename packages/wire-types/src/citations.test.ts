import { describe, expect, it } from "vitest";
import {
  citationAnchorSchema,
  decodeCitationsEnvelopes,
  encodeCitationsEnvelope,
  type SentCitation,
} from "./citations";

const first: SentCitation = {
  n: 1,
  fileName: "deck.pptx",
  page: 3,
  kind: "text",
  quote: 'Title --> "quoted"',
  comment: "Shorter",
  cropPath: "uploads/deck-slide3-a1.png",
};
const second: SentCitation = {
  n: 2,
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

  it("refuses an anchor box outside the page", () => {
    const parsed = citationAnchorSchema.safeParse({
      kind: "area",
      box: { x: 90, y: 0, w: 0, h: 10 },
    });
    expect(parsed.success).toBe(false);
  });
});
