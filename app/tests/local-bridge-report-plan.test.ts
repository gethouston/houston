import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  BridgeDisposedError,
  BridgeStateError,
} from "@houston/sdk/local-model-bridge/errors";
import { planLocalBridgeReport } from "../src/lib/local-bridge-report-plan.ts";

describe("planLocalBridgeReport", () => {
  it("drops an aborted operation, keeping only its cause for the debug log", () => {
    deepStrictEqual(
      planLocalBridgeReport(
        new DOMException("The operation was aborted.", "AbortError"),
      ),
      { kind: "cancelled", cause: "AbortError: The operation was aborted." },
    );
  });

  it("drops an operation that reached a disposed controller", () => {
    strictEqual(
      planLocalBridgeReport(new BridgeDisposedError()).kind,
      "cancelled",
    );
  });

  it("keeps the unsupported deployment as its quiet class", () => {
    deepStrictEqual(
      planLocalBridgeReport(
        Object.assign(new Error("unsupported"), {
          status: 503,
          body: { code: "bridge_not_supported" },
        }),
      ),
      { kind: "unsupported" },
    );
  });

  it("reports the SDK's expected bridge states as their quiet class, with the cause", () => {
    deepStrictEqual(planLocalBridgeReport("Bridge connection failed"), {
      kind: "quiet",
      quiet: "bridge_state",
      cause: "Bridge connection failed",
    });
    deepStrictEqual(
      planLocalBridgeReport(new BridgeStateError("reconnecting")),
      {
        kind: "quiet",
        quiet: "bridge_state",
        cause: "BridgeStateError: reconnecting",
      },
    );
    deepStrictEqual(
      planLocalBridgeReport(
        Object.assign(new Error("stale session (engine error 409)"), {
          status: 409,
          body: { code: "stale_session", error: "stale session" },
        }),
      ),
      {
        kind: "quiet",
        quiet: "bridge_state",
        cause: "Error: stale session (engine error 409)",
      },
    );
  });

  it("keeps every other rejection loud, with its name and message as the cause", () => {
    deepStrictEqual(
      planLocalBridgeReport(
        Object.assign(new Error("bridge unavailable (engine error 503)"), {
          status: 503,
          body: { code: "bridge_unavailable", error: "bridge unavailable" },
        }),
      ),
      { kind: "failed", cause: "Error: bridge unavailable (engine error 503)" },
    );
    deepStrictEqual(
      planLocalBridgeReport(
        Object.assign(new TypeError("Load failed"), { status: 0 }),
      ),
      { kind: "failed", cause: "TypeError: Load failed" },
    );
    deepStrictEqual(planLocalBridgeReport("Bridge connection refused (401)"), {
      kind: "failed",
      cause: "Bridge connection refused (401)",
    });
    deepStrictEqual(planLocalBridgeReport("boom"), {
      kind: "failed",
      cause: "boom",
    });
  });
});
