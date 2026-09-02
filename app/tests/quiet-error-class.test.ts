import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  agentKeyOf,
  classifyQuietError,
  quietErrorDetails,
} from "../src/lib/quiet-error-class.ts";

// PRODUCT-1640: the low-noise Sentry event for a quiet class must carry the
// RAW gateway body and the agent, off whichever client stack minted the error.

function named(
  name: string,
  message: string,
  fields: Record<string, unknown> = {},
): Error {
  const err = new Error(message);
  err.name = name;
  return Object.assign(err, fields);
}

const dial = "dial tcp: lookup agent-abc.svc.cluster.local: no such host";

describe("classifyQuietError", () => {
  it("names the waking and offline classes, nothing else", () => {
    strictEqual(
      classifyQuietError(
        named("HoustonEngineError", "engine unavailable (engine error 503)", {
          status: 503,
        }),
      ),
      "engine_waking",
    );
    strictEqual(classifyQuietError(new TypeError("Load failed")), "offline");
    strictEqual(
      classifyQuietError(
        named("HoustonEngineError", "agent not found (engine error 404)", {
          status: 404,
        }),
      ),
      null,
    );
    strictEqual(classifyQuietError(new TypeError("x is not a function")), null);
  });
});

describe("quietErrorDetails", () => {
  it("serializes the parsed gateway JSON a HoustonEngineError keeps", () => {
    const body = { error: "engine proxy failed", detail: dial };
    deepStrictEqual(
      quietErrorDetails(
        named("HoustonEngineError", "engine proxy failed (engine error 502)", {
          status: 502,
          body,
        }),
      ),
      { status: 502, body: JSON.stringify(body) },
    );
  });

  it("takes the raw text an AgentsHttpError carries as its message", () => {
    const raw = '{"error":"engine unavailable"}';
    deepStrictEqual(
      quietErrorDetails(named("AgentsHttpError", raw, { status: 503 })),
      { status: 503, body: raw },
    );
  });

  it("takes the raw text the runtime client keeps on body", () => {
    const raw = `{"error":"engine proxy failed","detail":"${dial}"}`;
    deepStrictEqual(
      quietErrorDetails(
        named("EngineError", `engine request failed (502): ${raw}`, {
          status: 502,
          body: raw,
        }),
      ),
      { status: 502, body: raw },
    );
  });

  it("has no status for a transport drop, and no body for a non-error", () => {
    deepStrictEqual(quietErrorDetails(new TypeError("Load failed")), {
      status: null,
      body: "Load failed",
    });
    deepStrictEqual(quietErrorDetails("boom"), { status: null, body: null });
  });
});

describe("agentKeyOf", () => {
  const stamped = named("HoustonEngineError", "engine unavailable", {
    status: 503,
    agentId: "agent-from-fetch",
  });

  it("prefers the fetch-stamped agent (the id successes reset), then the context", () => {
    strictEqual(
      agentKeyOf(stamped, { agentPath: "ws/agent" }),
      "agent-from-fetch",
    );
    const unstamped = named("EngineError", "engine request failed (503)", {
      status: 503,
    });
    strictEqual(
      agentKeyOf(unstamped, { agentId: "ctx-id", agentPath: "p" }),
      "ctx-id",
    );
    strictEqual(agentKeyOf(unstamped, { agentPath: "ws/agent" }), "ws/agent");
    strictEqual(agentKeyOf(unstamped, { fileCount: 3 }), null);
  });

  it("is null when no layer scoped the call", () => {
    strictEqual(agentKeyOf(new TypeError("Load failed")), null);
    strictEqual(agentKeyOf(undefined, { agentPath: "" }), null);
  });
});
