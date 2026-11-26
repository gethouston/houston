import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { beforeEach, describe, it, mock } from "node:test";
import { isBridgeCancellation } from "@houston/sdk/local-model-bridge/errors";

// HOUSTON-APP-5N5: on a desktop with a bridge journal, the manual form's save
// runs inside the bridge controller's `replaceEndpoint`. The save goes through
// `call()` (lib/tauri.ts), which already reports its own failure (or silences
// an expected one) and leaves the inline copy to the form. The same rejection
// then reached the bridge report funnel as a second "Local model connection
// failed" bug, once per submit.

const bridgeReports: unknown[][] = [];
const quietReports: unknown[][] = [];
let saveOutcome: () => Promise<void> = async () => {};
let retirement: () => Promise<void> = async () => {};

const lib = (path: string) => new URL(`../src/lib/${path}`, import.meta.url);

mock.module("@houston/sdk", { namedExports: { isBridgeCancellation } });
mock.module(lib("identity/session-store.ts").href, {
  namedExports: { peekSession: async () => ({ uid: "uid-1" }) },
});
mock.module(lib("local-bridge-binding.ts").href, {
  namedExports: {
    localBridgeSnapshot: () => ({
      status: "connected",
      journal: { phase: "committed" },
    }),
    // The SDK controller's `replaceEndpoint` awaits `save()` first and only
    // then retires the old bridge (packages/sdk/.../lifecycle.ts).
    localBridgeController: () => ({
      async replaceEndpoint(save: () => Promise<void>) {
        await save();
        await retirement();
      },
    }),
  },
});
mock.module(lib("os-bridge.ts").href, {
  namedExports: {
    osIsTauri: () => true,
    osDetectLocalModels: async () => [],
    legacyListen: async () => () => {},
    osCompleteBridgeMigration: async () => {},
    osForgetBridgeTarget: async () => {},
    osLocalBridgeDevice: async () => null,
    osLocalBridgeLegacyCandidate: async () => null,
    osRenewLocalBridge: async () => {},
    osSaveBridgeTarget: async () => {},
    osSavedBridgeTarget: async () => null,
    osStartLocalBridge: async () => {},
    osStopLocalBridge: async () => {},
  },
});
mock.module(lib("local-model.ts").href, {
  namedExports: { buildDirectEndpoint: () => ({}) },
});
mock.module(lib("tauri.ts").href, {
  namedExports: {
    tauriProvider: { setCustomEndpoint: () => saveOutcome() },
  },
});
mock.module(lib("error-toast.ts").href, {
  namedExports: {
    showErrorToast: (...args: unknown[]) => {
      bridgeReports.push(args);
    },
  },
});
mock.module(lib("quiet-error-report.ts").href, {
  namedExports: {
    reportQuietError: (...args: unknown[]) => {
      quietReports.push(args);
    },
  },
});

const { connectManualEndpoint } =
  await import("../src/lib/local-model-connect.ts");

const endpoint = { baseUrl: "localhost:11434", model: "llama3" };

function schemeRejection(): Error {
  return Object.assign(
    new Error("baseUrl must start with http:// or https:// (engine error 400)"),
    {
      status: 400,
      body: { error: "baseUrl must start with http:// or https://" },
    },
  );
}

describe("connectManualEndpoint through an owned bridge", () => {
  beforeEach(() => {
    bridgeReports.length = 0;
    quietReports.length = 0;
    saveOutcome = async () => {};
    retirement = async () => {};
  });

  it("hands a rejected save to the form without filing a second bridge report", async () => {
    const rejection = schemeRejection();
    saveOutcome = async () => {
      throw rejection;
    };
    await rejects(connectManualEndpoint(endpoint), (err) => err === rejection);
    deepStrictEqual(
      bridgeReports.map(([label]) => label),
      [],
    );
    strictEqual(quietReports.length, 0);
  });

  it("still reports a bridge retirement that fails after the save landed", async () => {
    const stopFailure = new Error("native stop failed");
    retirement = async () => {
      throw stopFailure;
    };
    await rejects(
      connectManualEndpoint(endpoint),
      (err) => err === stopFailure,
    );
    deepStrictEqual(
      bridgeReports.map(([label, message]) => [label, message]),
      [["local_model_bridge", "Local model connection failed"]],
    );
  });
});
