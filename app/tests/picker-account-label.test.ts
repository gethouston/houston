import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { buildPickerModels } from "../src/lib/chat-model-picker-map.ts";

const testProv = {
  id: "testprov",
  name: "Test",
  subtitle: "sub",
  models: [{ id: "m1", label: "M1 label", description: "curated desc" }],
};
const orProv = {
  id: "openrouter",
  name: "OpenRouter",
  subtitle: "",
  models: [
    { id: "vendor/or-1", label: "OR One label", description: "or curated" },
  ],
};
const localProv = {
  id: "openai-compatible",
  name: "Local",
  subtitle: "Ollama",
  models: [],
};

describe("picker rows name the AI account (HOU-976)", () => {
  it("appends the account to a row's subtitle", () => {
    const [m] = buildPickerModels({
      visibleProviders: [testProv],
      statuses: {},
      accountLabelOf: (id) => (id === "testprov" ? "your account" : undefined),
    });
    strictEqual(m.description, "curated desc · your account");
  });

  it("qualifies the LOCALIZED description, not the catalog English", () => {
    const [m] = buildPickerModels({
      visibleProviders: [testProv],
      statuses: {},
      describe: (_p, id, fallback) => `t:${id}:${fallback}`,
      accountLabelOf: () => "team account",
    });
    strictEqual(m.description, "t:m1:curated desc · team account");
  });

  it("labels per provider: one scoped row does not label its neighbour", () => {
    const rows = buildPickerModels({
      visibleProviders: [testProv, orProv],
      statuses: {},
      accountLabelOf: (id) =>
        id === "openrouter" ? "team account" : undefined,
    });
    strictEqual(rows[0].description, "curated desc");
    strictEqual(rows[1].description, "or curated · team account");
  });

  it("is byte-identical to today with no scope reported", () => {
    const before = buildPickerModels({
      visibleProviders: [testProv],
      statuses: {},
    });
    deepStrictEqual(
      buildPickerModels({
        visibleProviders: [testProv],
        statuses: {},
        accountLabelOf: () => undefined,
      }),
      before,
    );
  });

  it("labels the catalog-less local provider's dynamic row too", () => {
    const [m] = buildPickerModels({
      visibleProviders: [localProv],
      statuses: { "openai-compatible": { active_model: "llama3.1" } },
      accountLabelOf: () => "your account",
    });
    strictEqual(m.description, "Ollama · your account");
  });
});
