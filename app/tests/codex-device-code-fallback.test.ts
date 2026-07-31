import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type CodexDeviceCodeFallbackOps,
  runCodexDeviceCodeFallback,
} from "../src/lib/codex-device-code-fallback.ts";

// HOU-1063 — with OpenAI's fixed local callback port (1455) owned by another
// process, the desktop loopback relay cannot run and the connect click used
// to dead-end: no browser, an error toast, then the 5-minute connect timeout.
// During onboarding that was a wall. The relay now restarts the sign-in as a
// device-code grant (no local port needed); these pin the sequencing that
// makes the fallback correct.

function recordingOps(overrides: Partial<CodexDeviceCodeFallbackOps> = {}) {
  const calls: string[] = [];
  const failures: unknown[] = [];
  const ops: CodexDeviceCodeFallbackOps = {
    report: () => calls.push("report"),
    cancelLogin: async () => {
      calls.push("cancel");
    },
    launchDeviceCodeLogin: async () => {
      calls.push("launch");
    },
    fail: (cause) => {
      calls.push("fail");
      failures.push(cause);
    },
    ...overrides,
  };
  return { ops, calls, failures };
}

describe("runCodexDeviceCodeFallback", () => {
  it("reports the relay failure, then cancels BEFORE relaunching as device code", async () => {
    // Cancel-first is load-bearing: the runtime's startLogin idempotently
    // reuses an in-flight login, so relaunching without cancelling would hand
    // back the same dead loopback URL instead of a device code.
    const { ops, calls } = recordingOps();
    await runCodexDeviceCodeFallback(new Error("port 1455 unavailable"), ops);
    deepStrictEqual(calls, ["report", "cancel", "launch"]);
  });

  it("does not toast when the fallback succeeds — the code dialog is the surface", async () => {
    const { ops, calls } = recordingOps();
    await runCodexDeviceCodeFallback(new Error("port busy"), ops);
    strictEqual(calls.includes("fail"), false);
  });

  it("surfaces the relaunch failure when the fallback itself dies", async () => {
    const boom = new Error("engine unreachable");
    const { ops, calls, failures } = recordingOps({
      launchDeviceCodeLogin: async () => {
        throw boom;
      },
    });
    await runCodexDeviceCodeFallback(new Error("port busy"), ops);
    deepStrictEqual(calls, ["report", "cancel", "fail"]);
    deepStrictEqual(failures, [boom]);
  });

  it("skips the relaunch and surfaces the failure when cancel fails", async () => {
    // Launching over an uncancelled login would reuse the dead loopback flow;
    // better to fail loudly than to re-show a sign-in that cannot complete.
    const boom = new Error("cancel rejected");
    const { ops, calls, failures } = recordingOps({
      cancelLogin: async () => {
        throw boom;
      },
    });
    await runCodexDeviceCodeFallback(new Error("port busy"), ops);
    deepStrictEqual(calls, ["report", "fail"]);
    deepStrictEqual(failures, [boom]);
  });

  it("never rejects, even when every effect fails", async () => {
    const { ops } = recordingOps({
      cancelLogin: async () => {
        throw new Error("cancel died");
      },
    });
    // A rejection here would be an unhandled rejection in the event handler
    // that drives the relay — resolving is part of the contract.
    await runCodexDeviceCodeFallback(new Error("port busy"), ops);
  });
});
