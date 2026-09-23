import { strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { hiddenPromptDisplayText } from "../src/lib/hidden-prompt-display-text.ts";

describe("hiddenPromptDisplayText", () => {
  it("shows what the user wrote when the wire prompt was rewritten", () => {
    strictEqual(
      hiddenPromptDisplayText("Book my flight", true),
      "Book my flight",
    );
  });

  it("carries nothing when the prompt is the user's own text", () => {
    strictEqual(hiddenPromptDisplayText("Book my flight", false), undefined);
  });

  it("carries nothing for a conversation Houston started itself", () => {
    // An empty bubble is not a message: the hidden kickoff has no user text to
    // stand in for, so no displayText is sent and none is persisted.
    strictEqual(hiddenPromptDisplayText("", true), undefined);
    strictEqual(hiddenPromptDisplayText("", false), undefined);
  });
});
