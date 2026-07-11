import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { type ActivitiesViewModel, activitiesScope } from "./index";

const BASE = "http://127.0.0.1:4317";
const AGENT = "ag_1";

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

/**
 * A write-only SDK (`reactivity:false`, so NO `/v1/events` stream) over a mock
 * `fetch` that records every `/activities` call. `reactivity:false` is what lets
 * a "does not refetch" assertion be exact: a GET on the list route can only come
 * from a facade `refresh()` — a no-refetch write must issue none.
 */
function makeSdk() {
  const calls: Recorded[] = [];
  const wireActivity = (over: Record<string, unknown>) => ({
    id: "m1",
    title: "T",
    description: "",
    status: "running",
    ...over,
  });
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const body =
        init?.body === undefined ? undefined : JSON.parse(String(init.body));
      calls.push({ method, path: url.pathname, body });
      if (url.pathname.endsWith("/v1/events"))
        return new Response("", { status: 200 });
      if (method === "GET") return json({ items: [] });
      if (method === "DELETE") return json({ ok: true });
      // POST create / PATCH update echo a wire Activity.
      return json(wireActivity((body as Record<string, unknown>) ?? {}));
    },
  );
  const json = (b: unknown) =>
    new Response(JSON.stringify(b), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  const store = new Map<string, string>();
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: {
      get: async (k) => store.get(k) ?? null,
      set: async (k, v) => void store.set(k, v),
      delete: async (k) => void store.delete(k),
    },
    clock: {
      now: () => 0,
      setTimeout: () => 0,
      clearTimeout: () => {},
    },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = { baseUrl: BASE, ports, reactivity: false };
  const sdk = new HoustonSdk(config);
  return { sdk, calls };
}

const base = `/agents/${AGENT}/activities`;
const gets = (calls: Recorded[]) => calls.filter((c) => c.method === "GET");

describe("activities module — no-refetch writes", () => {
  it("writes.create POSTs the input and returns the wire activity, no refetch", async () => {
    const { sdk, calls } = makeSdk();
    const created = await sdk.activities.writes.create(AGENT, {
      title: "Reconcile",
    });
    expect(calls).toEqual([
      { method: "POST", path: base, body: { title: "Reconcile" } },
    ]);
    expect(created).toMatchObject({ id: "m1", title: "Reconcile" });
    expect(gets(calls)).toEqual([]); // no refresh() GET
    expect(sdk.getSnapshot(activitiesScope(AGENT))).toBeUndefined();
    sdk.dispose();
  });

  it("writes.setStatus PATCHes { status } and returns the activity, no refetch", async () => {
    const { sdk, calls } = makeSdk();
    const updated = await sdk.activities.writes.setStatus(AGENT, "m1", "done");
    expect(calls).toEqual([
      { method: "PATCH", path: `${base}/m1`, body: { status: "done" } },
    ]);
    expect(updated).toMatchObject({ id: "m1", status: "done" });
    expect(gets(calls)).toEqual([]);
    sdk.dispose();
  });

  it("writes.rename PATCHes { title }, no refetch", async () => {
    const { sdk, calls } = makeSdk();
    await sdk.activities.writes.rename(AGENT, "m1", "New title");
    expect(calls).toEqual([
      { method: "PATCH", path: `${base}/m1`, body: { title: "New title" } },
    ]);
    expect(gets(calls)).toEqual([]);
    sdk.dispose();
  });

  it("writes.delete DELETEs, no refetch", async () => {
    const { sdk, calls } = makeSdk();
    await sdk.activities.writes.delete(AGENT, "m1");
    expect(calls).toEqual([{ method: "DELETE", path: `${base}/m1` }]);
    expect(gets(calls)).toEqual([]);
    sdk.dispose();
  });

  it("the refetching facade create() DOES list afterward (contrast)", async () => {
    const { sdk, calls } = makeSdk();
    await sdk.activities.create(AGENT, "Reconcile");
    // POST then a GET list (the facade's refresh) — the behavior iOS relies on.
    expect(calls.map((c) => c.method)).toEqual(["POST", "GET"]);
    const snap = sdk.getSnapshot(activitiesScope(AGENT)) as ActivitiesViewModel;
    expect(snap.loaded).toBe(true);
    sdk.dispose();
  });
});
