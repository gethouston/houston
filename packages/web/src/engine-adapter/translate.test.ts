import { expect, test } from "bun:test";
import { EngineError, type HoustonEngineClient } from "@houston/runtime-client";
import { streamTurn, turnErrorMessage } from "./translate";

/** A minimal engine that settles a turn at once and records the send opts. */
function stubEngine(sent: Array<Record<string, unknown> | undefined>) {
  return {
    streamEvents(_sessionKey: string, opts: { onEvent: (e: unknown) => void }) {
      opts.onEvent({ type: "done", data: null });
      return Promise.resolve();
    },
    sendMessage(
      _sessionKey: string,
      _prompt: string,
      opts?: Record<string, unknown>,
    ) {
      sent.push(opts);
      return Promise.resolve();
    },
  } as unknown as HoustonEngineClient;
}

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

test("streamTurn forwards the effort pin to the engine send", async () => {
  // Without this, the composer's effort selector is cosmetic — the runtime never
  // sees it. The pin must reach `sendMessage` so the turn's reasoning level is set.
  const sent: Array<Record<string, unknown> | undefined> = [];
  await streamTurn(
    stubEngine(sent),
    "agent/x",
    "sess1",
    "hi",
    async () => {},
    "high",
  );
  expect(sent).toEqual([{ effort: "high" }]);
});

test("streamTurn omits the effort key when none is selected", async () => {
  const sent: Array<Record<string, unknown> | undefined> = [];
  await streamTurn(stubEngine(sent), "agent/x", "sess1", "hi", async () => {});
  expect(sent).toEqual([{}]);
});
