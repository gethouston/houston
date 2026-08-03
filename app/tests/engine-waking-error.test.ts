import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { isEngineWakingError } from "../src/lib/engine-waking-error.ts";

// HOU-1114: the surfacing-layer classifier that keeps the gateway's
// "engine unavailable" 503 (agent pod provisioning / cold-starting) out of the
// red bug-toast + Sentry pipeline. It must match exactly the gateway's
// pod-unreachable answer, and must NEVER match other 503s — a false positive
// here silently drops a real bug report.

/** The shape `HoustonEngineError` mints (structural stand-in, keeps the test
 *  dependency-free like the classifier itself). */
function engineError(status: number, reason?: string): Error {
  const err = new Error(
    reason ? `${reason} (engine error ${status})` : `engine error ${status}`,
  ) as Error & { status: number };
  err.name = "HoustonEngineError";
  err.status = status;
  return err;
}

describe("isEngineWakingError", () => {
  it("matches the gateway's engine-unavailable 503", () => {
    strictEqual(
      isEngineWakingError(engineError(503, "engine unavailable")),
      true,
    );
  });

  it("never matches other 503 reasons", () => {
    strictEqual(
      isEngineWakingError(engineError(503, "setup pod unreachable")),
      false,
    );
    strictEqual(isEngineWakingError(engineError(503)), false);
  });

  it("never matches the same reason on another status", () => {
    strictEqual(
      isEngineWakingError(engineError(502, "engine unavailable")),
      false,
    );
    strictEqual(
      isEngineWakingError(engineError(500, "engine unavailable")),
      false,
    );
  });

  it("requires the HoustonEngineError shape", () => {
    strictEqual(
      isEngineWakingError(new Error("engine unavailable (engine error 503)")),
      false,
    );
    strictEqual(
      isEngineWakingError("engine unavailable (engine error 503)"),
      false,
    );
    strictEqual(isEngineWakingError({ status: 503 }), false);
    strictEqual(isEngineWakingError(null), false);
    strictEqual(isEngineWakingError(undefined), false);
  });
});
