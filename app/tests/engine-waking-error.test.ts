import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { isEngineWakingError } from "../src/lib/engine-waking-error.ts";

// HOU-1114 / PRODUCT-1403: the surfacing-layer classifier that keeps the
// gateway's two pod-not-reachable answers — "engine unavailable" 503 (agent pod
// provisioning / cold-starting) and "engine proxy failed" 502 (the proxy could
// not connect to a pod restarting under an engine roll) — out of the red
// bug-toast + Sentry pipeline. It must match exactly those (status, reason)
// pairs, and must NEVER match other 502/503s — a false positive here silently
// drops a real bug report.

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

  it("matches the gateway's engine-proxy-failed 502 (PRODUCT-1403)", () => {
    // The proxy's answer carries the dial error as detail; HoustonEngineError
    // keeps only the reason in the message, so the prefix is what's matched.
    strictEqual(
      isEngineWakingError(engineError(502, "engine proxy failed")),
      true,
    );
  });

  it("never matches other 502 reasons", () => {
    strictEqual(
      isEngineWakingError(engineError(502, "agent pod unusable")),
      false,
    );
    strictEqual(isEngineWakingError(engineError(502)), false);
  });

  it("never matches either reason on another status", () => {
    strictEqual(
      isEngineWakingError(engineError(502, "engine unavailable")),
      false,
    );
    strictEqual(
      isEngineWakingError(engineError(500, "engine unavailable")),
      false,
    );
    strictEqual(
      isEngineWakingError(engineError(503, "engine proxy failed")),
      false,
    );
    strictEqual(
      isEngineWakingError(engineError(504, "engine proxy failed")),
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
