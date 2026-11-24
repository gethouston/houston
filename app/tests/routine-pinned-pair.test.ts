import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { DEFAULT_MODEL } from "@houston/sdk/provider-catalog";
import { routinePinnedPair } from "../src/lib/routine-pinned-pair.ts";

// The routine screen names the pin the fire path runs. A pair the screen shows
// as pinned while the fired turn runs something else is the defect: the user
// reads one model and is billed for another.
describe("routinePinnedPair", () => {
  it("names the pinned provider's default when the fire path drops the model", () => {
    // An id with no Claude family has no lineup model on `anthropic`: the
    // fired turn keeps the PROVIDER pin and runs that provider's model, never
    // the agent's own, so the screen names Claude, not whatever lab the agent
    // is on.
    deepStrictEqual(
      routinePinnedPair({ provider: "anthropic", model: "claude-2.1" }),
      { provider: "anthropic", model: DEFAULT_MODEL.anthropic },
    );
    // A finite-catalog id no table maps drops the same way.
    deepStrictEqual(
      routinePinnedPair({ provider: "openai-codex", model: "gpt-4.1" }),
      { provider: "openai", model: DEFAULT_MODEL["openai-codex"] },
    );
    // A provider-only pin (no model stored) runs on that provider too.
    deepStrictEqual(routinePinnedPair({ provider: "anthropic" }), {
      provider: "anthropic",
      model: DEFAULT_MODEL.anthropic,
    });
  });

  it("names the model a retired id fires on", () => {
    deepStrictEqual(
      routinePinnedPair({ provider: "anthropic", model: "claude-opus-4-8" }),
      { provider: "anthropic", model: "claude-opus-5-5" },
    );
    deepStrictEqual(
      routinePinnedPair({ provider: "anthropic", model: "claude-haiku-4-5" }),
      { provider: "anthropic", model: "claude-haiku-5-5" },
    );
    deepStrictEqual(
      routinePinnedPair({ provider: "openai-codex", model: "gpt-5.4-mini" }),
      { provider: "openai", model: "gpt-6-luna" },
    );
  });

  it("maps a Rust-era provider alias the way the fire path does", () => {
    deepStrictEqual(routinePinnedPair({ provider: "claude", model: "opus" }), {
      provider: "anthropic",
      model: "claude-opus-5-5",
    });
  });

  it("keeps an open-catalog gateway id the fire path passes through", () => {
    deepStrictEqual(
      routinePinnedPair({ provider: "opencode-go", model: "some-new-model" }),
      { provider: "opencode-go", model: "some-new-model" },
    );
    deepStrictEqual(
      routinePinnedPair({ provider: "opencode-go", model: "glm-5.1" }),
      { provider: "opencode-go", model: "glm-5.3" },
    );
  });

  it("carries no pin for a routine that follows the agent", () => {
    deepStrictEqual(routinePinnedPair({}), { provider: "", model: "" });
    deepStrictEqual(routinePinnedPair({ model: "claude-sonnet-5-5" }), {
      provider: "",
      model: "claude-sonnet-5-5",
    });
  });
});
