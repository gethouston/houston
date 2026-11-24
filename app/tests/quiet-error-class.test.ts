import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { UploadInterruptedError } from "@houston/sdk/files/upload-interrupted";
import { BridgeStateError } from "@houston/sdk/local-model-bridge/errors";
import { NoAgentForProviderWriteError } from "@houston/sdk/no-agent-provider-write-error";
import { isNetworkTransportError } from "../src/lib/network-transport-error.ts";
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

  // HOUSTON-APP-5CG: an upload the edge proxy cut at 60 s read as offline while
  // every other read answered. Its transport message is "Failed to fetch" too,
  // so the class must not fall through to offline.
  it("names an interrupted upload its own class, never offline", () => {
    const cut = new UploadInterruptedError(
      "attachments",
      6_000_000,
      60_000,
      "Failed to fetch",
    );
    strictEqual(classifyQuietError(cut), "upload_interrupted");
    strictEqual(isNetworkTransportError(cut), false);
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

  // PRODUCT-1833: the bridge bootstrap in a zero-agent space and the SDK's
  // own retry states are expected, inline-surfaced states, never a red bug
  // (HOUSTON-APP-5E0 / -5E1). The SDK names them; the app only binds.
  it("names the bridge_no_agent and bridge_state classes off the SDK's errors", () => {
    strictEqual(
      classifyQuietError(new NoAgentForProviderWriteError()),
      "bridge_no_agent",
    );
    const unavailable = new BridgeStateError("model_unavailable");
    strictEqual(classifyQuietError(unavailable), "bridge_state");
    deepStrictEqual(quietErrorDetails(unavailable), {
      status: null,
      body: "model_unavailable",
    });
    strictEqual(
      classifyQuietError(named("BridgeStateError", "reconnecting")),
      null,
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

  // HOUSTON-APP-5JZ / 5K0: a write against a routine a stale list still showed.
  it("names a routine write's typed 404 routine_gone, never an agent 404", () => {
    for (const body of [
      { error: "routine not found", code: "routine_not_found" },
      { error: "routine not found" },
    ])
      strictEqual(
        classifyQuietError(
          named("HoustonEngineError", "routine not found (engine error 404)", {
            status: 404,
            body,
          }),
        ),
        "routine_gone",
      );
    strictEqual(
      classifyQuietError(
        named("RoutinesHttpError", '{"error":"routine not found"}', {
          status: 404,
        }),
      ),
      "routine_gone",
    );
    strictEqual(
      classifyQuietError(
        named("HoustonEngineError", "agent not found (engine error 404)", {
          status: 404,
          body: { error: "agent not found" },
        }),
      ),
      null,
    );
  });
});

describe("classifyQuietError (typed compute and conversation refusals)", () => {
  const refusal = (body: Record<string, string>) =>
    named("AgentsHttpError", JSON.stringify(body), { status: 503 });

  it("names compute_busy its own class, never waking", () => {
    strictEqual(
      classifyQuietError(
        refusal({ error: "engine unavailable", code: "compute_busy" }),
      ),
      "compute_busy",
    );
  });

  it("leaves pod_wake_refused to the normal report path", () => {
    strictEqual(
      classifyQuietError(
        refusal({ error: "engine unavailable", code: "pod_wake_refused" }),
      ),
      null,
    );
  });

  it("names both conversation edit refusals one class", () => {
    for (const code of [
      "conversation_too_large_asleep",
      "conversation_op_refused",
    ])
      strictEqual(
        classifyQuietError(refusal({ error: "x", code })),
        "conversation_edit_refused",
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
    // The other classes are handed to their own surfaces before any capture.
    const handoff = body.indexOf(
      "surfaceQuietState(quiet, command, message, originalError)",
    );
    ok(handoff !== -1 && handoff < body.indexOf("sentryCapture("));
    const rest = readFileSync(
      join(import.meta.dirname, "../src/lib/quiet-state-surface.ts"),
      "utf8",
    );
    // PRODUCT-1833: the three bridge classes share one report-only branch.
    for (const kind of [
      "bridge_unsupported",
      "bridge_no_agent",
      "bridge_state",
    ])
      ok(rest.includes(`case "${kind}":`), `${kind} is a report-only class`);
    ok(
      rest.includes("reportQuietError(quiet, command, message, originalError)"),
    );
  });
});

describe("the engine-call and rejection layers take waking from the quiet classifier", () => {
  it("never shows the waking toast for a coded compute refusal", () => {
    for (const file of ["tauri.ts", "global-error-handlers.ts"]) {
      const source = readFileSync(
        join(import.meta.dirname, `../src/lib/${file}`),
        "utf8",
      );
      ok(!source.includes("isEngineWakingError("), `${file} reads the class`);
      ok(source.includes('=== "engine_waking"'), `${file} gates on the class`);
    }
  });
});
