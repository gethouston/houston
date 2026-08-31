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

  it("requires a known error shape", () => {
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

/** The shape the SDK agent-write path throws (`AgentsHttpError`): the message
 *  is the gateway's raw response body, verbatim. Structural stand-in, same as
 *  above. */
function agentsHttpError(status: number, body: string): Error {
  const err = new Error(body) as Error & { status: number };
  err.name = "AgentsHttpError";
  err.status = status;
  return err;
}

// HOUSTON-APP-536: renaming an asleep agent goes through the SDK write path,
// whose error carries the gateway body raw — the wake answers must classify
// quiet there too, including the rename route's transport-failure 502.
describe("isEngineWakingError (SDK agent-write shape)", () => {
  it("matches the wake 503 body", () => {
    strictEqual(
      isEngineWakingError(
        agentsHttpError(
          503,
          '{"detail":"agent is waking","error":"engine unavailable"}',
        ),
      ),
      true,
    );
  });

  it("matches the proxy-failed 502 body", () => {
    strictEqual(
      isEngineWakingError(
        agentsHttpError(
          502,
          '{"detail":"dial tcp: connection refused","error":"engine proxy failed"}',
        ),
      ),
      true,
    );
  });

  it("matches the rename route's pod-unusable 502 body", () => {
    strictEqual(
      isEngineWakingError(
        agentsHttpError(
          502,
          '{"detail":"engine json: Patch \\"http://agent-x:4318/agents/A\\": context deadline exceeded","error":"agent pod unusable"}',
        ),
      ),
      true,
    );
  });

  it("never matches other reasons or statuses", () => {
    strictEqual(
      isEngineWakingError(
        agentsHttpError(503, '{"error":"setup pod unreachable"}'),
      ),
      false,
    );
    strictEqual(
      isEngineWakingError(
        agentsHttpError(503, '{"error":"agent pod unusable"}'),
      ),
      false,
    );
    strictEqual(
      isEngineWakingError(
        agentsHttpError(500, '{"error":"engine unavailable"}'),
      ),
      false,
    );
    strictEqual(
      isEngineWakingError(agentsHttpError(409, '{"error":"name taken"}')),
      false,
    );
  });

  it("never matches non-JSON bodies", () => {
    strictEqual(
      isEngineWakingError(agentsHttpError(503, "agents request failed: 503")),
      false,
    );
    strictEqual(
      isEngineWakingError(agentsHttpError(502, "<html>Bad Gateway</html>")),
      false,
    );
    strictEqual(isEngineWakingError(agentsHttpError(503, "{not json")), false);
  });

  it("keeps pod-unusable a real error on the legacy shape (dispatch path)", () => {
    strictEqual(
      isEngineWakingError(engineError(502, "agent pod unusable")),
      false,
    );
  });
});

/** The shape `@houston/runtime-client` throws (`EngineError`): the message is
 *  `engine request failed (<status>): <body>` and `body` carries the raw
 *  response text. Structural stand-in, same as above. */
function runtimeEngineError(status: number, body: string): Error {
  const err = new Error(
    `engine request failed (${status}): ${body}`,
  ) as Error & {
    status: number;
    body: string;
  };
  err.name = "EngineError";
  err.status = status;
  err.body = body;
  return err;
}

// PRODUCT-1612 / HOUSTON-APP-4VN: first-run provider login runs in the hidden
// setup runtime through `@houston/runtime-client`, whose error carries the raw
// gateway body in `body` — the wake answers must classify quiet on this third
// shape too (a setup pod still provisioning showed the red bug pair + Sentry).
describe("isEngineWakingError (runtime-client shape)", () => {
  it("matches the setup-pod wake 503 body (PRODUCT-1612)", () => {
    strictEqual(
      isEngineWakingError(
        runtimeEngineError(
          503,
          '{"detail":"setup pod unreachable","error":"engine unavailable"}',
        ),
      ),
      true,
    );
  });

  it("matches the agent wake 503 body", () => {
    strictEqual(
      isEngineWakingError(
        runtimeEngineError(
          503,
          '{"detail":"agent is waking","error":"engine unavailable"}',
        ),
      ),
      true,
    );
  });

  it("matches the proxy-failed 502 body", () => {
    strictEqual(
      isEngineWakingError(
        runtimeEngineError(
          502,
          '{"detail":"dial tcp: connection refused","error":"engine proxy failed"}',
        ),
      ),
      true,
    );
  });

  it("never matches other reasons or statuses", () => {
    strictEqual(
      isEngineWakingError(
        runtimeEngineError(503, '{"error":"setup pod unreachable"}'),
      ),
      false,
    );
    strictEqual(
      isEngineWakingError(
        runtimeEngineError(502, '{"error":"agent pod unusable"}'),
      ),
      false,
    );
    strictEqual(
      isEngineWakingError(
        runtimeEngineError(500, '{"error":"engine unavailable"}'),
      ),
      false,
    );
    strictEqual(
      isEngineWakingError(runtimeEngineError(409, '{"error":"name taken"}')),
      false,
    );
  });

  it("never matches non-JSON or missing bodies", () => {
    strictEqual(
      isEngineWakingError(runtimeEngineError(503, "<html>Bad Gateway</html>")),
      false,
    );
    strictEqual(isEngineWakingError(runtimeEngineError(503, "")), false);
    const bodyless = new Error("engine request failed (503): ") as Error & {
      status: number;
    };
    bodyless.name = "EngineError";
    bodyless.status = 503;
    strictEqual(isEngineWakingError(bodyless), false);
  });
});
