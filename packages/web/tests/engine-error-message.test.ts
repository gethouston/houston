import { expect, test } from "vitest";
import { HoustonEngineError } from "../src/engine-adapter/client";

// The host's own explanation must survive into the error message — it is what
// the red toast, the frontend log, and the Sentry report show. A bare
// "engine error <status>" is only acceptable when the body carried no reason.

test("carries the host's string error body into the message", () => {
  const err = new HoustonEngineError(503, {
    error: "integrations not configured",
  });
  expect(err.message).toBe("integrations not configured (engine error 503)");
});

test("carries an object error body's message", () => {
  const err = new HoustonEngineError(500, {
    error: { message: "runtime crashed", kind: "runtime_dead" },
  });
  expect(err.message).toBe("runtime crashed (engine error 500)");
  expect(err.kind).toBe("runtime_dead");
});

test("falls back to the bare status when the body has no reason", () => {
  expect(new HoustonEngineError(503, null).message).toBe("engine error 503");
  expect(new HoustonEngineError(502, "<html>bad gateway</html>").message).toBe(
    "engine error 502",
  );
  expect(new HoustonEngineError(503, { error: 42 }).message).toBe(
    "engine error 503",
  );
});
