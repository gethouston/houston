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
