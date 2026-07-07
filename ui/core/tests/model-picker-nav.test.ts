import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  initialNav,
  type ModelPickerNav,
  navReducer,
} from "../src/components/model-picker/nav.ts";

const providers = (): ModelPickerNav => initialNav();

describe("navReducer", () => {
  it("opens at the provider level with an empty query", () => {
    assert.deepEqual(initialNav(), {
      query: "",
      view: { level: "providers" },
    });
  });

  it("setQuery updates the query but keeps the current view", () => {
    const s = navReducer(
      { query: "", view: { level: "models", providerId: "anthropic" } },
      { type: "setQuery", query: "opus" },
    );
    assert.equal(s.query, "opus");
    assert.deepEqual(s.view, { level: "models", providerId: "anthropic" });
  });

  it("setQuery to the same value returns the same reference (no churn)", () => {
    const s0: ModelPickerNav = { query: "x", view: { level: "providers" } };
    assert.equal(navReducer(s0, { type: "setQuery", query: "x" }), s0);
  });

  it("enterProvider drills into a provider's models and clears the query", () => {
    const s = navReducer(
      { query: "gpt", view: { level: "providers" } },
      { type: "enterProvider", providerId: "openai" },
    );
    assert.deepEqual(s, {
      query: "",
      view: { level: "models", providerId: "openai" },
    });
  });

  it("back steps from models to providers and clears the query", () => {
    const s = navReducer(
      { query: "sonnet", view: { level: "models", providerId: "anthropic" } },
      { type: "back" },
    );
    assert.deepEqual(s, { query: "", view: { level: "providers" } });
  });

  it("back at the provider level is a no-op (same reference)", () => {
    const s0 = providers();
    assert.equal(navReducer(s0, { type: "back" }), s0);
  });
});
