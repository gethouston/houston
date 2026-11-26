import { deepStrictEqual, rejects } from "node:assert";
import { describe, it } from "node:test";
import { BridgeDisposedError } from "@houston/sdk/local-model-bridge/errors";
import {
  ConnectAborted,
  connectManualEndpointWith,
} from "../src/lib/local-model-connect-core.ts";

// HOUSTON-APP-5N5: on a desktop with a bridge journal, the manual form's save
// runs inside the bridge controller's `replaceEndpoint`. The save goes through
// `call()` (lib/tauri.ts), which already reports its own failure (or silences
// an expected one) and leaves the inline copy to the form. The same rejection
// then reached the bridge report funnel as a second "Local model connection
// failed" bug, once per submit.

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

function harness(opts: {
  save?: () => Promise<void>;
  retirement?: () => Promise<void>;
  owned?: boolean;
}) {
  const reports: unknown[] = [];
  const saves: unknown[] = [];
  const deps = {
    // The SDK controller's `replaceEndpoint` awaits `save()` first and only
    // then retires the old bridge (packages/sdk/.../lifecycle.ts).
    bridge: async () =>
      opts.owned === false
        ? null
        : {
            async replaceEndpoint(save: () => Promise<void>) {
              await save();
              await (opts.retirement ?? (async () => {}))();
            },
          },
    save: async (manual: unknown) => {
      saves.push(manual);
      await (opts.save ?? (async () => {}))();
    },
    report: (error: unknown) => {
      reports.push(error);
    },
  };
  return { deps, reports, saves };
}

describe("connectManualEndpoint through an owned bridge", () => {
  it("hands a rejected save to the form without filing a second bridge report", async () => {
    const rejection = schemeRejection();
    const { deps, reports, saves } = harness({
      save: async () => {
        throw rejection;
      },
    });
    await rejects(
      connectManualEndpointWith(endpoint, deps),
      (err) => err === rejection,
    );
    deepStrictEqual(saves, [endpoint]);
    deepStrictEqual(reports, []);
  });

  it("still reports a bridge retirement that fails after the save landed", async () => {
    const stopFailure = new Error("native stop failed");
    const { deps, reports } = harness({
      retirement: async () => {
        throw stopFailure;
      },
    });
    await rejects(
      connectManualEndpointWith(endpoint, deps),
      (err) => err === stopFailure,
    );
    deepStrictEqual(reports, [stopFailure]);
  });

  it("turns a superseded bridge operation into ConnectAborted without a report", async () => {
    const { deps, reports } = harness({
      retirement: async () => {
        throw new BridgeDisposedError();
      },
    });
    await rejects(connectManualEndpointWith(endpoint, deps), ConnectAborted);
    deepStrictEqual(reports, []);
  });
});

describe("connectManualEndpoint with no owned bridge", () => {
  it("saves directly and leaves a failure to the form", async () => {
    const rejection = schemeRejection();
    const { deps, reports } = harness({
      owned: false,
      save: async () => {
        throw rejection;
      },
    });
    await rejects(
      connectManualEndpointWith(endpoint, deps),
      (err) => err === rejection,
    );
    deepStrictEqual(reports, []);
  });
});
