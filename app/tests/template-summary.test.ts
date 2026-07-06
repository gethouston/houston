import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  modelBrand,
  templateSummaryParts,
} from "../src/lib/template-summary.ts";

describe("modelBrand", () => {
  it("maps Anthropic model ids to Claude", () => {
    strictEqual(modelBrand("claude-opus-4-8"), "Claude");
    strictEqual(modelBrand("claude-sonnet-5"), "Claude");
    strictEqual(modelBrand("claude-fable-5"), "Claude");
  });

  it("maps OpenAI model ids to GPT", () => {
    strictEqual(modelBrand("gpt-5.5"), "GPT");
    strictEqual(modelBrand("gpt-5.3-codex-spark"), "GPT");
  });

  it("maps Gemini model ids to Gemini", () => {
    strictEqual(modelBrand("gemini-3-flash-preview"), "Gemini");
  });

  it("is case-insensitive", () => {
    strictEqual(modelBrand("CLAUDE-OPUS-4-8"), "Claude");
  });

  it("returns null when no model is pinned", () => {
    strictEqual(modelBrand(undefined), null);
    strictEqual(modelBrand(null), null);
    strictEqual(modelBrand(""), null);
  });

  it("falls back to the raw id for an unknown model", () => {
    strictEqual(modelBrand("mystery-model-9"), "mystery-model-9");
  });

  it("labels the same id identically on both template surfaces", () => {
    // The Templates tab and the create-from-template picker now share this one
    // helper. A bare Fable id and a Bedrock-style id used to diverge (the tab
    // split on the first token → "Fable" / "Us"; the picker showed "Claude").
    strictEqual(modelBrand("fable-5"), "Claude");
    strictEqual(modelBrand("us.anthropic.claude-opus"), "Claude");
  });
});

describe("templateSummaryParts", () => {
  it("restricted apps → concrete count, model brand, skill count", () => {
    deepStrictEqual(
      templateSummaryParts({
        skillCount: 3,
        model: "claude-opus-4-8",
        allowedToolkitCount: 2,
      }),
      { skillCount: 3, model: "Claude", allApps: false, appCount: 2 },
    );
  });

  it("null allowedToolkitCount → all apps allowed", () => {
    deepStrictEqual(
      templateSummaryParts({
        skillCount: 1,
        model: "gpt-5.5",
        allowedToolkitCount: null,
      }),
      { skillCount: 1, model: "GPT", allApps: true, appCount: null },
    );
  });

  it("no model pinned → model is null", () => {
    deepStrictEqual(
      templateSummaryParts({
        skillCount: 0,
        model: undefined,
        allowedToolkitCount: 0,
      }),
      { skillCount: 0, model: null, allApps: false, appCount: 0 },
    );
  });

  it("zero allowed apps is not the same as all apps", () => {
    const parts = templateSummaryParts({
      skillCount: 5,
      model: "claude-sonnet-4-6",
      allowedToolkitCount: 0,
    });
    strictEqual(parts.allApps, false);
    strictEqual(parts.appCount, 0);
  });
});
