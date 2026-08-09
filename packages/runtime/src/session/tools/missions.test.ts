import { expect, test } from "vitest";
import { missionPin } from "./missions";

/**
 * The child mission's default model pin (PRODUCT-1244). The inheritance is
 * load-bearing on managed cloud: an unpinned child turn is refused with
 * "No provider connected" because the runtime holds no standing provider —
 * the parent turn's resolved pair is the one known-good pin.
 */

const PARENT = { provider: "anthropic", model: "claude-sonnet-5" };

test("no explicit choice inherits the parent turn's provider AND model", () => {
  expect(missionPin({}, PARENT)).toEqual(PARENT);
});

test("an explicit provider stands alone — never mixed with the parent's model id", () => {
  expect(missionPin({ provider: "openai" }, PARENT)).toEqual({
    provider: "openai",
  });
  expect(missionPin({ provider: "openai", model: "gpt-5.5" }, PARENT)).toEqual({
    provider: "openai",
    model: "gpt-5.5",
  });
});

test("a model named without a provider rides the inherited provider", () => {
  expect(missionPin({ model: "claude-opus-5" }, PARENT)).toEqual({
    provider: "anthropic",
    model: "claude-opus-5",
  });
});

test("outside a turn (nothing inherited) the explicit params pass through", () => {
  expect(missionPin({}, undefined)).toEqual({});
  expect(missionPin({ model: "m" }, undefined)).toEqual({ model: "m" });
});
