import { afterEach, expect, test, vi } from "vitest";

/**
 * Write-through invalidation echo (the hosted "instant status flip" fix).
 *
 * In hosted (control-plane) mode the board/config/routine/skill/learnings caches
 * invalidate ONLY on events from the host's global `/v1/events` stream, which the
 * gateway historically never forwarded for pod events — so after the adapter's
 * OWN write the UI stuck (a settled turn's card hung on "running"). The adapter
 * now echoes the matching invalidation event locally, in the EXACT shape a real
 * server frame produces (`control-plane.toInvalidationEvent`). These tests assert
 * the echo fires on the settle path and on other writes, with the correct keys,
 * and that its shape is byte-identical to a server frame's.
 *
 * Every write here goes through `@houston/sdk` and is served by a stubbed
 * `fetch`; only the global `/v1/events` subscription is mocked away, so the bus
 * carries nothing but the echoes the client itself pushed.
 */
vi.mock("../src/engine-adapter/control-plane", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/engine-adapter/control-plane")
    >();
  return { ...actual, subscribeEvents: vi.fn(() => () => {}) };
});

import { bus, emitLocalEcho } from "../src/engine-adapter/bus";
import { HoustonClient } from "../src/engine-adapter/client";
import { toInvalidationEvent } from "../src/engine-adapter/control-plane";

type BusEvent = { type: string; data: { agent_path?: string } };

function capture() {
  const events: BusEvent[] = [];
  const off = bus.on((e) => events.push(e as BusEvent));
  return { events, off };
}

function hostedClient() {
  return new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

/** Serve the board read the settle path matches on, and accept every write. */
function stubHostFetch() {
  const row = {
    id: "a1",
    title: "t",
    description: "",
    status: "running",
    session_key: "sk-1",
    updated_at: 0,
  };
  globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    // The Stop answers "nothing was in flight" — the orphan the settle path is
    // about. Everything else echoes the row back.
    const body = String(url).endsWith("/cancel")
      ? { ok: true, cancelled: false }
      : (init?.method ?? "GET") === "GET"
        ? { items: [row] }
        : row;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

test("the settle path echoes ActivityChanged with the agent key", async () => {
  // cancelSession is a settle-and-PATCH: the runtime reports no live turn
  // (`cancelled: false`), so the client writes the board status itself — the
  // same setActivityStatus write a turn's own settle performs.
  stubHostFetch();
  const client = hostedClient();
  const { events, off } = capture();
  await client.cancelSession("Home/Ada", "sk-1");
  off();

  const echoes = events.filter((e) => e.type === "ActivityChanged");
  expect(echoes).toEqual([
    toInvalidationEvent({ type: "ActivityChanged", agentPath: "Home/Ada" }),
  ]);
});

test("routine CRUD echoes RoutinesChanged with the agent key", async () => {
  stubHostFetch();
  const client = hostedClient();
  const { events, off } = capture();
  await client.createRoutine("Home/Ada", {
    name: "Daily",
  } as Parameters<HoustonClient["createRoutine"]>[1]);
  off();

  expect(events.filter((e) => e.type === "RoutinesChanged")).toEqual([
    toInvalidationEvent({ type: "RoutinesChanged", agentPath: "Home/Ada" }),
  ]);
});

test("a files-first write echoes its classified event (learnings)", async () => {
  stubHostFetch();
  const client = hostedClient();
  const { events, off } = capture();
  await client.writeAgentFile(
    "Home/Ada",
    ".houston/learnings/learnings.json",
    "[]",
  );
  off();

  expect(events.filter((e) => e.type === "LearningsChanged")).toEqual([
    toInvalidationEvent({ type: "LearningsChanged", agentPath: "Home/Ada" }),
  ]);
});

test("emitLocalEcho is byte-identical to the server frame the gateway will send", () => {
  // Shape parity: the invalidation hook keys off `data.agent_path`; a locally
  // synthesized echo and a real `/v1/events` frame must be indistinguishable, or
  // one silently no-ops. Assert the echo the client emits equals what the ONE
  // server-frame translator produces for the same event.
  const { events, off } = capture();
  emitLocalEcho("ActivityChanged", { agentPath: "W/A" });
  off();

  expect(events).toEqual([
    toInvalidationEvent({ type: "ActivityChanged", agentPath: "W/A" }),
  ]);
});
