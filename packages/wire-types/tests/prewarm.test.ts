import { describe, expect, it } from "vitest";
import { parseConversationPrewarmAnswer } from "../src/prewarm.ts";

describe("parseConversationPrewarmAnswer", () => {
  it("reads every outcome the gateway answers", () => {
    expect(
      parseConversationPrewarmAnswer({ outcome: "launching", holdMs: 30_000 }),
    ).toEqual({ outcome: "launching", holdMs: 30_000 });
    expect(
      parseConversationPrewarmAnswer({ outcome: "held", holdMs: 30_000 }),
    ).toEqual({ outcome: "held", holdMs: 30_000 });
    expect(
      parseConversationPrewarmAnswer({
        outcome: "skipped",
        reason: "routine",
        holdMs: 0,
      }),
    ).toEqual({ outcome: "skipped", reason: "routine", holdMs: 0 });
  });

  it("drops an empty or non-string reason", () => {
    expect(
      parseConversationPrewarmAnswer({
        outcome: "skipped",
        reason: "",
        holdMs: 0,
      }),
    ).toEqual({ outcome: "skipped", holdMs: 0 });
    expect(
      parseConversationPrewarmAnswer({
        outcome: "skipped",
        reason: 7,
        holdMs: 0,
      }),
    ).toEqual({ outcome: "skipped", holdMs: 0 });
  });

  it("refuses a body that is not an answer", () => {
    for (const body of [
      null,
      "launching",
      [],
      { outcome: "queued", holdMs: 0 },
      { outcome: "held" },
      { outcome: "held", holdMs: -1 },
      { outcome: "held", holdMs: Number.NaN },
      { outcome: "held", holdMs: "30000" },
    ])
      expect(() => parseConversationPrewarmAnswer(body)).toThrow();
  });
});
