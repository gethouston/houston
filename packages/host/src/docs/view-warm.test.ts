import type { HoustonEvent } from "@houston/protocol";
import { expect, test, vi } from "vitest";
import type { EventHub } from "../events/hub";
import { MemoryWorkspaceStore } from "../store/memory";
import { refreshViewsOnEvents } from "./view-warm";

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
