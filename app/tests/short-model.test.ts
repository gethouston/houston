import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shortModel } from "../src/lib/usage-format.ts";

describe("shortModel", () => {
  it("formats Claude full ids with a dot-separated version", () => {
    assert.equal(shortModel("claude-sonnet-4-6"), "Sonnet 4.6");
    assert.equal(shortModel("claude-opus-4-8"), "Opus 4.8");
    assert.equal(shortModel("claude-opus-4-7"), "Opus 4.7");
  });

  it("formats the OpenAI version id", () => {
    assert.equal(shortModel("gpt-5.5"), "GPT-5.5");
  });

  it("title-cases legacy shorthand aliases", () => {
    assert.equal(shortModel("sonnet"), "Sonnet");
    assert.equal(shortModel("opus"), "Opus");
  });
});
