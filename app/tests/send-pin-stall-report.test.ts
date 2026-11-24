import { deepStrictEqual, strictEqual } from "node:assert";
import { beforeEach, describe, it, mock } from "node:test";

type Call = { fn: string; args: unknown[] };
const calls: Call[] = [];
mock.module(new URL("../src/lib/error-report.ts", import.meta.url).href, {
  namedExports: {
    logAndReportError: (...args: unknown[]) =>
      calls.push({ fn: "logAndReportError", args }),
  },
});
mock.module(new URL("../src/lib/quiet-error-report.ts", import.meta.url).href, {
  namedExports: {
    reportQuietError: (...args: unknown[]) =>
      calls.push({ fn: "reportQuietError", args }),
  },
});
const { reportSendPinStall } = await import(
  "../src/lib/send-pin-stall-report.ts"
);

const signals = {
  agentConfigSettled: true,
  activitySettled: true,
  capabilitiesSettled: true,
  choiceSettled: true,
  statusesSettled: false,
};
const calm = { online: true, engineWarming: false, failures: {} };

describe("reportSendPinStall (HOUSTON-APP-5EX)", () => {
  beforeEach(() => {
    calls.length = 0;
    mock.method(console, "warn", () => {});
  });

  it("files a real report that names the stalled inputs and groups on them", () => {
    reportSendPinStall(signals, calm, "agent-1");
    strictEqual(calls.length, 1);
    const [call] = calls;
    strictEqual(call?.fn, "logAndReportError");
    const [command, err, detail] = call?.args ?? [];
    strictEqual(command, "chat.send-pin-settle");
    strictEqual(
      (err as Error).message,
      "composer pin never settled (waiting on statuses); sent the current pin",
    );
    deepStrictEqual(detail, {
      tags: { unsettled_inputs: "statuses" },
      fingerprint: ["chat.send-pin-settle", "statuses"],
    });
  });

  for (const [env, quiet] of [
    [{ ...calm, online: false }, "offline"],
    [{ ...calm, engineWarming: true }, "engine_waking"],
  ] as const) {
    it(`is the ${quiet} quiet warning when the stall is the environment`, () => {
      reportSendPinStall(signals, env, "agent-1");
      strictEqual(calls.length, 1);
      const [call] = calls;
      strictEqual(call?.fn, "reportQuietError");
      const [kind, command, , , context, extra] = call?.args ?? [];
      strictEqual(kind, quiet);
      strictEqual(command, "chat.send-pin-settle");
      strictEqual(context, undefined);
      deepStrictEqual(extra, {
        unsettled_inputs: ["statuses"],
        stalled_agent_id: "agent-1",
      });
    });
  }
});
