import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  allowedToolkitsReady,
  assembleSpec,
  canSaveTemplate,
  providerBrand,
  summarizeSpec,
} from "../src/components/tabs/save-as-template-model.ts";

describe("save-as-template model — assembleSpec", () => {
  it("maps instructions, skills, and allowed apps verbatim", () => {
    const spec = assembleSpec({
      instructions: "You are a sales agent.",
      skills: [{ name: "Email", content: "# Email\nbody" }],
      provider: "anthropic",
      model: "claude-opus",
      effort: "high",
      allowedToolkits: ["gmail", "slack"],
    });
    deepStrictEqual(spec, {
      instructions: "You are a sales agent.",
      skills: [{ name: "Email", content: "# Email\nbody" }],
      allowedToolkits: ["gmail", "slack"],
      provider: "anthropic",
      model: "claude-opus",
      effort: "high",
    });
  });

  it("omits absent model fields rather than emitting empty strings", () => {
    const spec = assembleSpec({
      instructions: "",
      skills: [],
      allowedToolkits: null,
    });
    deepStrictEqual(spec, {
      instructions: "",
      skills: [],
      allowedToolkits: null,
    });
    strictEqual("provider" in spec, false);
    strictEqual("model" in spec, false);
    strictEqual("effort" in spec, false);
  });

  it("keeps allowedToolkits null (all apps allowed) distinct from empty", () => {
    strictEqual(
      assembleSpec({ instructions: "", skills: [], allowedToolkits: null })
        .allowedToolkits,
      null,
    );
    deepStrictEqual(
      assembleSpec({ instructions: "", skills: [], allowedToolkits: [] })
        .allowedToolkits,
      [],
    );
  });
});

describe("save-as-template model — summarizeSpec", () => {
  it("emits instructions, skills, model, and app-count segments in order", () => {
    deepStrictEqual(
      summarizeSpec({
        instructions: "hi",
        skillCount: 3,
        provider: "anthropic",
        model: "claude-opus",
        allowedToolkits: ["gmail", "slack"],
      }),
      [
        { kind: "instructions" },
        { kind: "skills", count: 3 },
        { kind: "model", provider: "anthropic", model: "claude-opus" },
        { kind: "apps", count: 2 },
      ],
    );
  });

  it("drops the instructions segment when instructions are blank", () => {
    deepStrictEqual(
      summarizeSpec({
        instructions: "   ",
        skillCount: 0,
        allowedToolkits: null,
      }),
      [{ kind: "allApps" }],
    );
  });

  it("drops the skills segment at zero and the model segment when unpinned", () => {
    deepStrictEqual(
      summarizeSpec({
        instructions: "x",
        skillCount: 0,
        allowedToolkits: [],
      }),
      [{ kind: "instructions" }, { kind: "apps", count: 0 }],
    );
  });

  it("shows the model segment when only a model (no provider) is pinned", () => {
    deepStrictEqual(
      summarizeSpec({
        instructions: "",
        skillCount: 0,
        model: "gpt-5",
        allowedToolkits: null,
      }),
      [
        { kind: "model", provider: undefined, model: "gpt-5" },
        { kind: "allApps" },
      ],
    );
  });
});

describe("save-as-template model — providerBrand", () => {
  it("maps known providers to brand names, others to null", () => {
    strictEqual(providerBrand("anthropic"), "Claude");
    strictEqual(providerBrand("openai"), "OpenAI");
    strictEqual(providerBrand("mistral"), null);
    strictEqual(providerBrand(undefined), null);
  });
});

describe("save-as-template model — canSaveTemplate", () => {
  it("requires a non-empty name after trimming", () => {
    strictEqual(canSaveTemplate("Sales Agent"), true);
    strictEqual(canSaveTemplate("  Sales  "), true);
    strictEqual(canSaveTemplate(""), false);
    strictEqual(canSaveTemplate("   "), false);
  });
});

describe("save-as-template model — allowedToolkitsReady", () => {
  it("blocks save in multiplayer when settings are absent (loading or errored)", () => {
    // Regression: an errored/absent agent-settings fetch leaves the ceiling
    // undefined, read as null = ALL apps. The guard must not let a manager
    // capture that over-permissioned ceiling.
    strictEqual(allowedToolkitsReady(true, false), false);
  });

  it("allows save in multiplayer once the real ceiling has resolved", () => {
    strictEqual(allowedToolkitsReady(true, true), true);
  });

  it("is always ready in single-player, where there is no ceiling concept", () => {
    strictEqual(allowedToolkitsReady(false, false), true);
    strictEqual(allowedToolkitsReady(false, true), true);
  });
});
