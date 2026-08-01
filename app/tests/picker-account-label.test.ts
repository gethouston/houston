import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { buildPickerModels } from "../src/lib/chat-model-picker-map.ts";

/**
 * The chat model picker names WHOSE AI account a provider's models run on
 * (HOU-976 §6): a member on their own account reads "your account", a member
 * running on the team's reads "team account", and a deployment that reports no
 * scope at all reads exactly what it read before the feature existed.
 *
 * These live here, in the GATED suite (`pnpm test` globs `tests/*.test.ts`),
 * rather than beside `chat-model-picker-map.ts`: the colocated
 * `src/lib/*.test.mjs` files are run by no script and no CI job, so coverage
 * placed there is coverage nobody enforces. The pure `withAccountLabel` rule and
 * the scope decisions this reads from are in `credential-scope.test.ts`.
 */

/** A normal catalogued provider: one curated model, a non-empty subtitle. */
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
/** The local OpenAI-compatible provider: no catalog, model reported at runtime. */
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
    // Order matters: the label must sit after the translated text, else a
    // Spanish picker reads an English fallback with a Spanish suffix.
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
    // Absence is the old world: desktop, self-host and a personal space report
    // no scope, so their rows must be indistinguishable from the pre-HOU-976
    // ones. Asserted as a deep-equal against the label-less build, so a future
    // change that starts emitting an empty qualifier fails here.
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
