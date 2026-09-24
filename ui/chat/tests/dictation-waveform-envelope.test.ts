import { equal, notEqual } from "node:assert";
import { describe, it } from "node:test";
import { withAlpha } from "../src/dictation-waveform-envelope.ts";

describe("withAlpha", () => {
  it("replaces the alpha of the colour forms the tokens emit", () => {
    equal(withAlpha("#ff8800", 0.5), "rgba(255, 136, 0, 0.5)");
    equal(withAlpha("rgba(10, 20, 30, 1)", 0), "rgba(10, 20, 30, 0)");
  });

  it("keeps a fully transparent stop transparent on an unparsable colour", () => {
    // The gradient's first stop MUST vanish: handing the input back unchanged
    // turned the fade-in stop into an opaque one, so the oldest slice of the
    // waveform slammed to full colour instead of fading off the left edge.
    const unparsable = "oklab(0.5 0 0)";
    notEqual(withAlpha(unparsable, 0), unparsable);
    equal(withAlpha(unparsable, 0), "transparent");
  });

  it("keeps an unparsable colour's own opacity at a visible alpha", () => {
    equal(withAlpha("oklab(0.5 0 0)", 0.9), "oklab(0.5 0 0)");
  });
});
