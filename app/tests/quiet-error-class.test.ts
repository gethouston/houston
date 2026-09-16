import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

/**
 * A gateway client's error shape: an HTTP `status` with the observed payload on
 * `body`, and — on a network-level failure (`status: 0`) — the thrown transport
 * error kept as BOTH the body and the standard `cause`.
 */
function gatewayError(status: number, message: string, body: unknown): Error {
  const err = new Error(
    message,
    body instanceof Error ? { cause: body } : undefined,
  );
  err.name = "GatewayApiError";
  return Object.assign(err, { status, body });
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

  // PRODUCT-1735: a client's status-0 wrapper around a thrown fetch is the
  // offline class; a real gateway status stays a bug (a 5xx is ours to fix).
  it("names the offline class for a client's network-failure wrapper", () => {
    const offline = gatewayError(
      0,
      "Failed to fetch",
      new TypeError("Failed to fetch"),
    );
    strictEqual(classifyQuietError(offline), "offline");
    strictEqual(
      classifyQuietError(
        gatewayError(502, "Gateway request failed (502).", "Bad Gateway"),
      ),
      null,
    );
  });

  // PRODUCT-1717: a gateway without the local-model bridge answers every
  // desktop boot; it is one quiet class, and it wins over the waking 503.
  it("names the bridge_unsupported class off the adapter's 503 body", () => {
    strictEqual(
      classifyQuietError(
        named(
          "HoustonEngineError",
          "This server does not support local model connections. (engine error 503)",
          {
            status: 503,
            body: {
              code: "bridge_not_supported",
              error: "This server does not support local model connections.",
            },
          },
        ),
      ),
      "bridge_unsupported",
    );
    strictEqual(
      classifyQuietError(
        named("HoustonEngineError", "engine unavailable (engine error 503)", {
          status: 503,
          body: { error: "engine unavailable" },
        }),
      ),
      "engine_waking",
    );
  });

  // PRODUCT-1666: the three shapes that escaped the waking class.
  it("names the waking class for the still-starting 503 and the activities shape", () => {
    strictEqual(
      classifyQuietError(
        named(
          "EngineError",
          'engine request failed (503): {"error":"the agent\'s runtime is still starting, try again shortly"}',
          {
            status: 503,
            body: '{"error":"the agent\'s runtime is still starting, try again shortly"}',
          },
        ),
      ),
      "engine_waking",
    );
    strictEqual(
      classifyQuietError(
        named(
          "ActivitiesHttpError",
          `{"detail":"Post ...: ${dial}","error":"engine proxy failed"}`,
          { status: 502 },
        ),
      ),
      "engine_waking",
    );
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

  it("reads a client's status-0 wrapper as a transport drop", () => {
    deepStrictEqual(
      quietErrorDetails(
        gatewayError(0, "Load failed", new TypeError("Load failed")),
      ),
      { status: null, body: "Load failed" },
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

/**
 * PRODUCT-1735 (HOUSTON-APP-54J / 55K): `showErrorToast` is the last reporting
 * surface a raw TanStack query error can reach without passing through the
 * engine-call layer's quiet-class gate, so an offline device was captured as a
 * per-user bug 36 times. The gate has to run BEFORE the per-event Sentry
 * capture, and each class has to keep its own informational surface.
 *
 * Asserted against the source: `error-toast` pulls i18n and the Zustand store,
 * neither of which loads under this suite's runner (the same constraint
 * `error-toast-not-shown.test.ts` works around).
 */
describe("showErrorToast routes the quiet classes to their own surfaces", () => {
  const source = readFileSync(
    join(import.meta.dirname, "../src/lib/error-toast.ts"),
    "utf8",
  );
  const body = source.slice(source.indexOf("export function showErrorToast("));

  it("classifies before the per-event Sentry capture", () => {
    ok(source.includes('from "./quiet-error-class"'));
    const guard = body.indexOf("classifyQuietError(originalError)");
    const capture = body.indexOf("sentryCapture(");
    ok(guard !== -1, "showErrorToast must classify quiet errors");
    ok(capture !== -1, "every other failure keeps its per-event capture");
    ok(guard < capture, "the quiet guard must run before the capture");
  });

  it("keeps each class on its existing informational surface", () => {
    ok(
      body.includes(
        "showConnectivityErrorToast(command, message, originalError)",
      ),
    );
    ok(body.includes("showEngineWakingToast(command, message, originalError)"));
    ok(body.includes('reportQuietError("bridge_unsupported"'));
  });
});
