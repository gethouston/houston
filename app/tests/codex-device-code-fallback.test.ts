import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type CodexDeviceCodeFallbackOps,
  runCodexDeviceCodeFallback,
} from "../src/lib/codex-device-code-fallback.ts";

function recordingOps(overrides: Partial<CodexDeviceCodeFallbackOps> = {}) {
  const calls: string[] = [];
  const failures: unknown[] = [];
  const ops: CodexDeviceCodeFallbackOps = {
    report: () => calls.push("report"),
    reportPortTaken: () => calls.push("reportPortTaken"),
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
    const { ops, calls } = recordingOps();
    await runCodexDeviceCodeFallback(new Error("port 1455 unavailable"), ops);
    deepStrictEqual(calls, ["report", "cancel", "launch"]);
  });

  it("reports a taken port as the machine's state, not a Houston error", async () => {
    const { ops, calls } = recordingOps();
    await runCodexDeviceCodeFallback(
      "Could not start the Codex sign-in listener: port 1455 is unavailable (os error 10048). OpenAI requires this exact port, so close other AI coding tools (or wait a few minutes) and try again.",
      ops,
    );
    deepStrictEqual(calls, ["reportPortTaken", "cancel", "launch"]);
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
    await runCodexDeviceCodeFallback(new Error("port busy"), ops);
  });
});
