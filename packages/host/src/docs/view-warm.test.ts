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
