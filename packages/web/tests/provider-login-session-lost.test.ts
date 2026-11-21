import { isProviderLoginSessionLostError } from "@houston/engine-adapter/provider-login-session-lost";
import { EngineError } from "@houston/runtime-client";
import { expect, test } from "vitest";

test("matches the runtime's no-active-login 400 on the runtime client shape", () => {
  const err = new EngineError(
    400,
    JSON.stringify({ error: "no active login for openai-codex" }),
  );
  expect(isProviderLoginSessionLostError(err)).toBe(true);
});

test("matches any provider id after the reason prefix", () => {
  const err = new EngineError(
    400,
    JSON.stringify({ error: "no active login for anthropic" }),
  );
  expect(isProviderLoginSessionLostError(err)).toBe(true);
});

test("rejects other 400 reasons on the same route", () => {
  const err = new EngineError(
    400,
    JSON.stringify({ error: "unknown provider: nope" }),
  );
  expect(isProviderLoginSessionLostError(err)).toBe(false);
});

test("rejects the reason on a different status", () => {
  const err = new EngineError(
    503,
    JSON.stringify({ error: "no active login for openai-codex" }),
  );
  expect(isProviderLoginSessionLostError(err)).toBe(false);
});

test("rejects non-JSON bodies and non-engine errors", () => {
  expect(
    isProviderLoginSessionLostError(
      new EngineError(400, "no active login for openai-codex"),
    ),
  ).toBe(false);
  expect(
    isProviderLoginSessionLostError(
      new Error(
        'engine request failed (400): {"error":"no active login for openai-codex"}',
      ),
    ),
  ).toBe(false);
  expect(isProviderLoginSessionLostError("Load failed")).toBe(false);
});
