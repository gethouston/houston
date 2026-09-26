import { setAdapterErrorSink } from "@houston/engine-adapter";
import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// A layout read that degrades still answers, but the degrade itself must reach
// the app's reporting path (frontend log + Sentry), not only the console.

const originalFetch = globalThis.fetch;
const empty = { groups: [], order: [] };
const device = {
  groups: [{ id: "g1", name: "Ops", collapsed: false, agentIds: ["a1"] }],
  order: [{ kind: "group", id: "g1" }],
};
let store: Map<string, string>;
const reports: Array<{ source: string; error: unknown }> = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(capabilities: Response, put: Response): void {
  globalThis.fetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/v1/workspaces"))
        return json([
          { id: "Personal", name: "Personal", isDefault: true, createdAt: "0" },
        ]);
      if (url.endsWith("/v1/capabilities")) return capabilities.clone();
      if (url.endsWith("/sidebar-layout"))
        return init?.method === "PUT" ? put.clone() : json(empty);
      throw new Error(`unexpected request: ${url}`);
    },
  ) as typeof fetch;
}

function client(): HoustonClient {
  return new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
}

beforeEach(() => {
  store = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  setAdapterErrorSink((source, error) => reports.push({ source, error }));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  reports.length = 0;
  vi.restoreAllMocks();
});

test("a failed capabilities probe is reported and the hosted layout returned", async () => {
  stubFetch(json({ error: "boom" }, 500), json(empty));
  expect(await client().getSidebarLayout("default")).toEqual(empty);
  expect(reports.map((report) => report.source)).toEqual([
    "sidebar-layout.capabilities",
  ]);
});

test("a device layout the host refuses is reported and dropped", async () => {
  store.set("houston.sidebar-layout.default", JSON.stringify(device));
  stubFetch(json({ profile: "local" }), json({ error: "invalid" }, 400));
  expect(await client().getSidebarLayout("default")).toEqual(empty);
  expect(reports.map((report) => report.source)).toEqual([
    "sidebar-layout.device-seed-refused",
  ]);
  expect(store.has("houston.sidebar-layout.default")).toBe(false);
});

test("an unreadable device layout is reported and dropped", async () => {
  store.set("houston.sidebar-layout.default", "{not json");
  stubFetch(json({ profile: "local" }), json(empty));
  expect(await client().getSidebarLayout("default")).toEqual(empty);
  expect(reports.map((report) => report.source)).toEqual([
    "sidebar-layout.device-layout-unreadable",
  ]);
  expect(store.has("houston.sidebar-layout.default")).toBe(false);
});

function blockStorage(): void {
  const refuse = () => {
    throw new DOMException("storage disabled", "SecurityError");
  };
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: refuse,
    setItem: refuse,
    removeItem: refuse,
  };
}

test("storage that refuses access is reported and the cloud layout returned", async () => {
  blockStorage();
  stubFetch(json({ profile: "cloud" }), json(empty));
  expect(await client().getSidebarLayout("default")).toEqual(empty);
  expect(reports.map((report) => report.source)).toEqual([
    "sidebar-layout.device-storage",
  ]);
});

test("storage that refuses access is reported and the local layout returned", async () => {
  blockStorage();
  stubFetch(json({ profile: "local" }), json(empty));
  expect(await client().getSidebarLayout("default")).toEqual(empty);
  expect(reports.map((report) => report.source)).toEqual([
    "sidebar-layout.device-storage",
  ]);
});
