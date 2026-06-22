import { expect, test } from "bun:test";
import { EngineError } from "@houston/runtime-client";
import { turnErrorMessage } from "./translate";

test("turnErrorMessage unwraps the engine's plain message from a rejected send", () => {
  // The runtime refuses a not-connected turn with 409 + a JSON body; the user must
  // see the plain sentence, never the status code or the JSON wrapper.
  const err = new EngineError(
    409,
    JSON.stringify({
      error: "No provider connected. Log in with Claude or Codex first.",
    }),
  );
  expect(turnErrorMessage(err)).toBe(
    "No provider connected. Log in with Claude or Codex first.",
  );
});

test("turnErrorMessage falls back to the raw message for a non-JSON engine body", () => {
  const err = new EngineError(500, "upstream exploded");
  expect(turnErrorMessage(err)).toBe(err.message);
});

test("turnErrorMessage handles plain errors and non-errors", () => {
  expect(turnErrorMessage(new Error("boom"))).toBe("boom");
  expect(turnErrorMessage("just a string")).toBe("just a string");
});
