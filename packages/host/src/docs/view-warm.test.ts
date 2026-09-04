import type { HoustonEvent } from "@houston/protocol";
import { expect, test, vi } from "vitest";
import type { EventHub } from "../events/hub";
import { MemoryWorkspaceStore } from "../store/memory";
import { refreshViewsOnEvents, warmViewDocs } from "./view-warm";

function hub(): EventHub & { fire: (e: HoustonEvent) => void } {
  const handlers: Array<(e: HoustonEvent) => void> = [];
  return {
    emit() {},
    subscribe(_user, handler) {
      handlers.push(handler);
      return () => {};
    },
    fire: (e) => {
      for (const h of handlers) h(e);
    },
  };
}

// A freshly woken pod's runtime may take its whole 60s boot-health budget
// (probes answer 503 throughout); the warm must outlast that, not give up
// mid-boot (HOUSTON-APP-5AP).
test("boot warm outlasts a runtime that takes 70s to become healthy", async () => {
  vi.useFakeTimers();
  const store = new MemoryWorkspaceStore();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  await store.createAgent({ workspaceId: workspace.id, name: "Only" });
  const start = Date.now();
  const statuses: number[] = [];
  const fetchImpl = vi.fn(async () => {
    const status = Date.now() - start < 70_000 ? 503 : 200;
    statuses.push(status);
    return new Response("{}", { status });
  }) as unknown as typeof fetch;
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  warmViewDocs({ port: 4318, token: "t", store, fetchImpl });
  await vi.advanceTimersByTimeAsync(200_000);
  expect(statuses).toContain(200);
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
  vi.useRealTimers();
});

function stillStarting(): Response {
  return new Response('{"error":"still starting"}', {
    status: 503,
    headers: { "Retry-After": "2" },
  });
}

// A fleet-synchronised roll can blow the launcher's 60s boot budget outright;
// the warm's next probe re-spawns, so the runtime is only up after a SECOND
// full boot. The warm must cover that, not give up between the two.
test("boot warm outlasts a failed first boot plus a second one (150s)", async () => {
  vi.useFakeTimers();
  const store = new MemoryWorkspaceStore();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  await store.createAgent({ workspaceId: workspace.id, name: "Only" });
  const start = Date.now();
  const statuses: number[] = [];
  const fetchImpl = vi.fn(async () => {
    const response =
      Date.now() - start < 150_000
        ? stillStarting()
        : new Response("{}", { status: 200 });
    statuses.push(response.status);
    return response;
  }) as unknown as typeof fetch;
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  warmViewDocs({ port: 4318, token: "t", store, fetchImpl });
  await vi.advanceTimersByTimeAsync(400_000);
  expect(statuses).toContain(200);
  expect(errorSpy).not.toHaveBeenCalled();
  expect(warnSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
  warnSpy.mockRestore();
  vi.useRealTimers();
});

// A runtime STILL not up after the whole window is the launcher's failure and
// already a Sentry error there; the warm stands down as a breadcrumb instead
// of filing a second error per pod per roll (HOUSTON-APP-5AP).
test("a runtime still starting after the whole window stands down quietly", async () => {
  vi.useFakeTimers();
  const store = new MemoryWorkspaceStore();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  await store.createAgent({ workspaceId: workspace.id, name: "Only" });
  const fetchImpl = vi.fn(async () =>
    stillStarting(),
  ) as unknown as typeof fetch;
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  warmViewDocs({ port: 4318, token: "t", store, fetchImpl });
  await vi.advanceTimersByTimeAsync(1_000_000);
  expect(errorSpy).not.toHaveBeenCalled();
  // One stand-down per view route, each after its own window.
  expect(warnSpy).toHaveBeenCalledTimes(4);
  expect(warnSpy.mock.calls[0]?.[0]).toMatch(/still starting/);
  errorSpy.mockRestore();
  warnSpy.mockRestore();
  vi.useRealTimers();
});

// A runtime that IS up but answers the view with an error is a broken view,
// never a boot: that stays loud.
test("a view that keeps answering 500 after the window still reports", async () => {
  vi.useFakeTimers();
  const store = new MemoryWorkspaceStore();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  await store.createAgent({ workspaceId: workspace.id, name: "Only" });
  const fetchImpl = vi.fn(
    async () => new Response("{}", { status: 500 }),
  ) as unknown as typeof fetch;
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  warmViewDocs({ port: 4318, token: "t", store, fetchImpl });
  await vi.advanceTimersByTimeAsync(1_000_000);
  expect(warnSpy).not.toHaveBeenCalled();
  expect(errorSpy).toHaveBeenCalledTimes(4);
  expect(errorSpy.mock.calls[0]?.[0]).toMatch(/gave up \(last status 500\)/);
  errorSpy.mockRestore();
  warnSpy.mockRestore();
  vi.useRealTimers();
});

// A plain 503 (no Retry-After) is not the probe contract's "not now" — e.g. a
// route with no channel wired — and stays loud like any other failure.
test("a bare 503 without Retry-After still reports", async () => {
  vi.useFakeTimers();
  const store = new MemoryWorkspaceStore();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  await store.createAgent({ workspaceId: workspace.id, name: "Only" });
  const fetchImpl = vi.fn(
    async () => new Response("{}", { status: 503 }),
  ) as unknown as typeof fetch;
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  warmViewDocs({ port: 4318, token: "t", store, fetchImpl });
  await vi.advanceTimersByTimeAsync(1_000_000);
  expect(warnSpy).not.toHaveBeenCalled();
  expect(errorSpy).toHaveBeenCalledTimes(4);
  errorSpy.mockRestore();
  warnSpy.mockRestore();
  vi.useRealTimers();
});

test("a SkillsChanged event re-fetches /skills for that agent (debounced)", async () => {
  vi.useFakeTimers();
  const store = new MemoryWorkspaceStore();
  const urls: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const events = hub();
  refreshViewsOnEvents({
    port: 4318,
    token: "t",
    store,
    events,
    userId: "local-owner",
    fetchImpl,
  });
  events.fire({ type: "SkillsChanged", agentPath: "Personal/Bob" });
  events.fire({ type: "SkillsChanged", agentPath: "Personal/Bob" });
  await vi.advanceTimersByTimeAsync(600);
  expect(urls).toEqual(["http://127.0.0.1:4318/agents/Personal%2FBob/skills"]);
  vi.useRealTimers();
});

// An agent delete/rename unlinks its skills tree; the watcher classifies each
// unlink as SkillsChanged for the now-gone path, and the debounced refresh
// then 404s. A gone agent is the delete's designed outcome, never an error
// (HOUSTON-APP-5AP).
test("a refresh 404 for an agent no longer in the store stays silent", async () => {
  vi.useFakeTimers();
  const store = new MemoryWorkspaceStore();
  const fetchImpl = vi.fn(
    async () => new Response('{"error":"agent not found"}', { status: 404 }),
  ) as unknown as typeof fetch;
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const events = hub();
  refreshViewsOnEvents({
    port: 4318,
    token: "t",
    store,
    events,
    userId: "local-owner",
    fetchImpl,
  });
  events.fire({ type: "SkillsChanged", agentPath: "Personal/Deleted" });
  await vi.advanceTimersByTimeAsync(600);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
  vi.useRealTimers();
});

test("a refresh failure for an agent still in the store reports", async () => {
  vi.useFakeTimers();
  const store = new MemoryWorkspaceStore();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({
    workspaceId: workspace.id,
    name: "Only",
  });
  const fetchImpl = vi.fn(
    async () => new Response("{}", { status: 500 }),
  ) as unknown as typeof fetch;
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const events = hub();
  refreshViewsOnEvents({
    port: 4318,
    token: "t",
    store,
    events,
    userId: "local-owner",
    fetchImpl,
  });
  events.fire({ type: "SkillsChanged", agentPath: agent.id });
  await vi.advanceTimersByTimeAsync(600);
  expect(errorSpy).toHaveBeenCalledOnce();
  errorSpy.mockRestore();
  vi.useRealTimers();
});

test("a global CustomIntegrationsChanged resolves the single agent", async () => {
  vi.useFakeTimers();
  const store = new MemoryWorkspaceStore();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({
    workspaceId: workspace.id,
    name: "Only",
  });
  const urls: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const events = hub();
  refreshViewsOnEvents({
    port: 4318,
    token: "t",
    store,
    events,
    userId: "local-owner",
    fetchImpl,
  });
  events.fire({ type: "CustomIntegrationsChanged" });
  await vi.advanceTimersByTimeAsync(600);
  expect(urls).toEqual([
    `http://127.0.0.1:4318/agents/${encodeURIComponent(agent.id)}/integrations/custom/definitions`,
  ]);
  // Unrelated events never fetch.
  events.fire({ type: "ActivityChanged", agentPath: agent.id });
  await vi.advanceTimersByTimeAsync(600);
  expect(urls).toHaveLength(1);
  vi.useRealTimers();
});
