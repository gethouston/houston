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
 * The control-plane module is mocked so cp-mode writes resolve without a network,
 * letting us observe the echo the client pushes onto the in-process bus.
 */
vi.mock("../src/engine-adapter/control-plane", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/engine-adapter/control-plane")
    >();
  return {
    ...actual,
    runtimeClientFor: vi.fn(() => ({
      cancel: vi.fn(async () => ({ cancelled: false })),
      setSettings: vi.fn(async () => {}),
    })),
    subscribeEvents: vi.fn(() => () => {}),
    listActivities: vi.fn(async () => [
      {
        id: "a1",
        title: "t",
        description: "",
        status: "running",
        session_key: "sk-1",
        updated_at: 0,
      },
    ]),
    updateActivity: vi.fn(async () => ({})),
    createRoutine: vi.fn(async () => ({ id: "r1" })),
    writeAgentFile: vi.fn(async () => {}),
  };
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

afterEach(() => vi.clearAllMocks());

test("the settle path echoes ActivityChanged with the agent key", async () => {
  // cancelSession is a settle-and-PATCH: the runtime reports no live turn
  // (`cancelled: false`), so the client writes the board status itself — the
  // same setActivityStatus write a turn's own settle performs.
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
