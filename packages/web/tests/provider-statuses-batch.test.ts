import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { listProviders } = vi.hoisted(() => ({
  listProviders: vi.fn(),
}));

vi.mock("@houston/engine-adapter/control-plane", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@houston/engine-adapter/control-plane")
    >();
  return {
    ...actual,
    runtimeClientFor: vi.fn(() => ({ listProviders })),
  };
});

import { HoustonClient } from "@houston/engine-adapter/client";
import { HoustonEngineError } from "@houston/engine-adapter/client/errors";
import { setAdapterErrorSink } from "@houston/engine-adapter/error-sink";
import { EngineError } from "@houston/runtime-client";
import {
  restoreAgentListFetch,
  stubAgentListFetch,
  wireAgent,
} from "./support/agent-list";

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) =>
      k === "houston.pref.last_agent_id" ? "agent-1" : null,
    setItem: () => {},
    removeItem: () => {},
  };
  listProviders.mockReset();
  stubAgentListFetch([wireAgent("agent-1")]);
});

afterEach(() => {
  restoreAgentListFetch();
  vi.clearAllMocks();
});

async function settledClient() {
  const c = new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
  await c.listAgents("ws");
  return c;
}

test("providerStatuses fetches the provider list ONCE for many cards", async () => {
  listProviders.mockResolvedValue([
    { id: "anthropic", configured: true, activeModel: "claude-sonnet-4-6" },
    { id: "openai-codex", configured: false },
    { id: "opencode", configured: true },
  ]);

  const names = [
    "anthropic",
    "openai",
    "opencode",
    "opencode-go",
    "openrouter",
    "not-a-provider",
  ];
  const statuses = await (await settledClient()).providerStatuses(names);

  expect(listProviders).toHaveBeenCalledTimes(1);
  expect(statuses.map((s) => s.authState)).toEqual([
    "authenticated",
    "unauthenticated",
    "authenticated",
    "unauthenticated",
    "unauthenticated",
    "unauthenticated",
  ]);
  expect(statuses.map((s) => s.provider)).toEqual(names);
  expect(statuses[0].activeModel).toBe("claude-sonnet-4-6");
});

test("providerStatus delegates to the batch (one fetch, correct entry)", async () => {
  listProviders.mockResolvedValue([{ id: "anthropic", configured: true }]);

  const status = await (await settledClient()).providerStatus("anthropic");

  expect(listProviders).toHaveBeenCalledTimes(1);
  expect(status.authState).toBe("authenticated");
  expect(status.provider).toBe("anthropic");
});

test("an unreachable runtime reports every card UNKNOWN without throwing", async () => {
  listProviders.mockRejectedValue(new Error("sandbox unreachable"));

  const statuses = await (await settledClient()).providerStatuses([
    "anthropic",
    "opencode",
  ]);

  expect(statuses.map((s) => s.authState)).toEqual(["unknown", "unknown"]);
});

test("the probe is bounded by an abort signal, so a wedged host cannot pend forever", async () => {
  listProviders.mockResolvedValue([]);

  await (await settledClient()).providerStatuses(["anthropic"]);

  const [opts] = listProviders.mock.calls[0];
  expect(opts.signal).toBeInstanceOf(AbortSignal);
  expect(opts.signal.aborted).toBe(false);
});

test("a reachable runtime still gives a confirmed unauthenticated for absent providers", async () => {
  listProviders.mockResolvedValue([{ id: "anthropic", configured: true }]);

  const statuses = await (await settledClient()).providerStatuses([
    "anthropic",
    "opencode",
  ]);

  expect(statuses.map((s) => s.authState)).toEqual([
    "authenticated",
    "unauthenticated",
  ]);
});

test("the probe still runs on a webview without AbortSignal.timeout", async () => {
  const original = AbortSignal.timeout;
  Reflect.deleteProperty(AbortSignal, "timeout");
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    listProviders.mockResolvedValue([{ id: "anthropic", configured: true }]);
    const statuses = await (await settledClient()).providerStatuses([
      "anthropic",
    ]);
    expect(statuses.map((s) => s.authState)).toEqual(["authenticated"]);
    const [opts] = listProviders.mock.calls[0];
    vi.advanceTimersByTime(15_000);
    expect((opts.signal.reason as Error).name).toBe("TimeoutError");
  } finally {
    vi.useRealTimers();
    AbortSignal.timeout = original;
  }
});

test("an unreachable runtime stays quiet; any other probe failure is reported", async () => {
  const reports: { source: string; error: unknown }[] = [];
  setAdapterErrorSink((source, error) => reports.push({ source, error }));
  try {
    const client = await settledClient();
    listProviders.mockRejectedValueOnce(new TypeError("Load failed"));
    await client.providerStatuses(["anthropic"]);
    listProviders.mockRejectedValueOnce(
      new DOMException("signal timed out", "TimeoutError"),
    );
    await client.providerStatuses(["anthropic"]);
    listProviders.mockRejectedValueOnce(
      new EngineError(401, '{"error":"signed_out"}'),
    );
    await client.providerStatuses(["anthropic"]);
    expect(reports).toEqual([]);

    const bug = new TypeError("undefined is not a function");
    listProviders.mockRejectedValueOnce(bug);
    const statuses = await client.providerStatuses(["anthropic"]);
    expect(statuses.map((s) => s.authState)).toEqual(["unknown"]);
    expect(reports).toEqual([{ source: "provider-status.probe", error: bug }]);
  } finally {
    setAdapterErrorSink((source, error) => console.error(`[${source}]`, error));
  }
});

test("a failure that repeats on every re-probe is reported once per signature", async () => {
  const reports: { source: string; error: unknown }[] = [];
  setAdapterErrorSink((source, error) => reports.push({ source, error }));
  try {
    const client = await settledClient();
    const first = new EngineError(500, '{"error":"provider list failed"}');
    listProviders.mockRejectedValueOnce(first);
    for (let i = 1; i < 5; i++) {
      listProviders.mockRejectedValueOnce(
        new EngineError(500, '{"error":"provider list failed"}'),
      );
    }
    for (let i = 0; i < 5; i++) await client.providerStatuses(["anthropic"]);
    expect(reports).toEqual([
      { source: "provider-status.probe", error: first },
    ]);

    const other = new HoustonEngineError(504, { error: "gateway timeout" });
    listProviders.mockRejectedValueOnce(other);
    listProviders.mockRejectedValueOnce(
      new HoustonEngineError(504, { error: "gateway timeout" }),
    );
    await client.providerStatuses(["anthropic"]);
    await client.providerStatuses(["anthropic"]);
    expect(reports.map((r) => r.error)).toEqual([first, other]);
  } finally {
    setAdapterErrorSink((source, error) => console.error(`[${source}]`, error));
  }
});
