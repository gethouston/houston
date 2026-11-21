import { afterEach, expect, test, vi } from "vitest";

vi.mock("@houston/engine-adapter/control-plane", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@houston/engine-adapter/control-plane")
    >();
  return { ...actual, subscribeEvents: vi.fn(() => () => {}) };
});

import { bus, emitLocalEcho } from "@houston/engine-adapter/bus";
import { HoustonClient } from "@houston/engine-adapter/client";
import { toInvalidationEvent } from "@houston/engine-adapter/control-plane";

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
  const { events, off } = capture();
  emitLocalEcho("ActivityChanged", { agentPath: "W/A" });
  off();

  expect(events).toEqual([
    toInvalidationEvent({ type: "ActivityChanged", agentPath: "W/A" }),
  ]);
});
