import type { Routine } from "@houston/protocol";
import { expect, test } from "vitest";
import { routinePin } from "./routine-pin";
import { createRoutine } from "./routines";

/**
 * routinePin is the read-time mapping between what a routine stored and the
 * provider/model pin its fired turn carries. Two invariants: a Rust-era id
 * maps to its pi id (so migrated routines keep working), and an UNKNOWN id
 * passes through verbatim (so the runtime rejects it visibly — never a silent
 * switch to a provider the user didn't choose).
 */

function routine(over: Partial<Routine> = {}): Routine {
  return {
    ...createRoutine(
      { name: "R", prompt: "p", schedule: "0 9 * * *" },
      "r1",
      "2026-06-12T12:00:00.000Z",
    ),
    ...over,
  };
}

test("no pin → both null (inherit the agent default)", () => {
  expect(routinePin(routine())).toEqual({ provider: null, model: null });
});

test("a valid pi provider/model pin passes through untouched", () => {
  expect(
    routinePin(routine({ provider: "anthropic", model: "claude-opus-4-8" })),
  ).toEqual({ provider: "anthropic", model: "claude-opus-4-8" });
});

test("a Rust-era provider alias maps to its pi id", () => {
  expect(routinePin(routine({ provider: "claude" })).provider).toBe(
    "anthropic",
  );
  expect(routinePin(routine({ provider: "codex" })).provider).toBe(
    "openai-codex",
  );
});

test("an unknown provider passes through verbatim — visible failure, not a silent switch", () => {
  expect(routinePin(routine({ provider: "gemini-cli", model: "m" }))).toEqual({
    provider: "gemini-cli",
    model: "m",
  });
});

test("an unmappable model under a known provider drops to the provider default (never hard-fails every run)", () => {
  const pin = routinePin(
    routine({ provider: "anthropic", model: "claude-2.1" }),
  );
  expect(pin.provider).toBe("anthropic");
  expect(pin.model).toBeNull();
});

test("an open-catalog gateway keeps whatever model was stored", () => {
  expect(
    routinePin(routine({ provider: "opencode", model: "some-new-model" }))
      .model,
  ).toBe("some-new-model");
});

test("an open-catalog gateway's renamed row is pinned to its successor", () => {
  // The stored id (`mimo-v2.5-free`, curated while pi 0.85.1 shipped it) has no
  // model object left in pi 0.87.1, so passing it through verbatim fails the
  // run on every fire; the same-tier successor keeps the routine alive.
  expect(
    routinePin(routine({ provider: "opencode", model: "mimo-v2.5-free" }))
      .model,
  ).toBe("mimo-v2.6-flash-free");
});

test("a renamed deepseek row keeps its pin instead of dropping it", () => {
  // An unmappable model drops to null (the agent's own model runs instead). A
  // RENAME is mappable, so the model the user pinned must survive.
  expect(
    routinePin(routine({ provider: "deepseek", model: "deepseek-v4-flash" }))
      .model,
  ).toBe("deepseek-flash");
});
