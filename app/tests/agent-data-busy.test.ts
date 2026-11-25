import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it, mock } from "node:test";

// HOUSTON-APP-5HP: a read of a sleeping agent's data the gateway cannot serve
// yet answers `503 {"error":"agent data temporarily unavailable; retrying"}`.
// Nothing is waking (a read never wakes the agent), so the "waking up" notice
// would be wrong: the person sees nothing, and we get one fingerprinted
// warning per burst instead of a bug per read.

type Toast = { title: string; description: string };
type QuietEvent = { fingerprint: string[]; tags: Record<string, string> };
const toasts: Toast[] = [];
const quietEvents: QuietEvent[] = [];
const bugCaptures: unknown[] = [];

const href = (rel: string) => new URL(rel, import.meta.url).href;
mock.module("@houston/engine-adapter", {
  namedExports: { isSignedOutEngineError: () => false },
});
mock.module(href("../src/stores/ui.ts"), {
  namedExports: {
    useUIStore: {
      getState: () => ({ addToast: (t: Toast) => toasts.push(t) }),
    },
  },
});
mock.module(href("../src/lib/i18n.ts"), {
  defaultExport: { t: (key: string) => key },
});
mock.module(href("../src/lib/analytics.ts"), {
  namedExports: {
    analytics: { track: () => {} },
    classifyAnalyticsError: () => "other",
  },
});
mock.module(href("../src/lib/sentry.ts"), {
  namedExports: {
    captureException: async (err: unknown) => {
      bugCaptures.push(err);
    },
    sentrySuppressedInDev: false,
  },
});
mock.module(href("../src/lib/sentry-quiet.ts"), {
  namedExports: {
    captureQuietEvent: (_err: unknown, event: QuietEvent) =>
      quietEvents.push(event),
  },
});

const { showErrorToast } = await import("../src/lib/error-toast.ts");
const { reportError } = await import("../src/lib/error-report.ts");
const { classifyQuietError } = await import("../src/lib/quiet-error-class.ts");
const { isAgentDataBusyError, isEngineWakingError } =
  await import("../src/lib/engine-waking-error.ts");

const BUSY = "agent data temporarily unavailable; retrying";

function engineError(status: number, reason: string, agentId: string): Error {
  const err = new Error(`${reason} (engine error ${status})`);
  err.name = "HoustonEngineError";
  return Object.assign(err, { status, agentId });
}

function sdkError(status: number, reason: string): Error {
  const err = new Error(JSON.stringify({ error: reason }));
  err.name = "AgentsHttpError";
  return Object.assign(err, { status });
}

function runtimeError(status: number, reason: string): Error {
  const err = new Error(`engine error ${status}`);
  err.name = "EngineError";
  return Object.assign(err, {
    status,
    body: JSON.stringify({ error: reason }),
  });
}

beforeEach(() => {
  toasts.length = 0;
  quietEvents.length = 0;
  bugCaptures.length = 0;
});

describe("the agent-data-busy answer", () => {
  it("is its own quiet class on every client shape, never waking", () => {
    for (const err of [
      engineError(503, BUSY, "a1"),
      sdkError(503, BUSY),
      runtimeError(503, BUSY),
    ]) {
      strictEqual(isEngineWakingError(err), false);
      strictEqual(isAgentDataBusyError(err), true);
      strictEqual(classifyQuietError(err), "agent_data_busy");
    }
  });

  it("is a 503 reason only", () => {
    strictEqual(isAgentDataBusyError(engineError(502, BUSY, "a1")), false);
    strictEqual(
      isAgentDataBusyError(engineError(503, "agent data unavailable", "a1")),
      false,
    );
    strictEqual(
      isAgentDataBusyError(engineError(503, "engine unavailable", "a1")),
      false,
    );
  });

  it("leaves a real waking answer on the waking notice", () => {
    const waking = engineError(503, "engine unavailable", "waking-1");
    strictEqual(classifyQuietError(waking), "engine_waking");
    showErrorToast("list_skills", "engine unavailable", waking);
    deepStrictEqual(
      toasts.map((t) => t.title),
      ["shell:errorToast.engineWakingTitle"],
    );
    deepStrictEqual(quietEvents[0].fingerprint, ["engine_waking"]);
  });

  it("shows no toast and reports one quiet warning per burst", () => {
    for (let i = 0; i < 3; i++) {
      strictEqual(
        showErrorToast("list_skills", BUSY, engineError(503, BUSY, "busy-1")),
        false,
      );
    }
    reportError("list_skills", BUSY, engineError(503, BUSY, "busy-1"));
    deepStrictEqual(toasts, []);
    deepStrictEqual(bugCaptures, []);
    strictEqual(quietEvents.length, 1);
    deepStrictEqual(quietEvents[0].fingerprint, ["agent_data_busy"]);
    strictEqual(quietEvents[0].tags.quiet_class, "agent_data_busy");
  });
});

// `surfaceError` in tauri.ts pulls the whole engine barrel, so its routing is
// pinned against the source, the same way engine-waking-rejection-gate does.
describe("the engine-call layer routes the busy answer report-only", () => {
  const source = readFileSync(
    join(import.meta.dirname, "../src/lib/tauri.ts"),
    "utf8",
  );
  const body = source.slice(source.indexOf("async function surfaceError("));
  const busy = body.indexOf(
    'if (classifyQuietError(err) === "agent_data_busy")',
  );
  const waking = body.indexOf(
    'if (classifyQuietError(err) === "engine_waking")',
  );
  const branch = body.slice(busy, waking);

  it("reports the quiet class before the waking branch, with no toast", () => {
    ok(busy !== -1 && busy < waking, "busy guard must precede waking");
    ok(
      branch.includes(
        'reportQuietError("agent_data_busy", label, message, err, context)',
      ),
    );
    ok(!branch.includes("Toast"), "the busy answer shows nothing");
    ok(branch.includes("return false"), "nothing was told to the user");
  });
});
