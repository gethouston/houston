import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";
import {
  isEmptySidebarLayout,
  shouldSeedHostLayout,
} from "../src/engine-adapter/client/sidebar-layout-store";

/**
 * Where the sidebar's order + grouping is persisted, per deployment.
 *
 * The adapter used to keep it in `localStorage` on EVERY deployment, so the
 * host's `GROUP.md` fan-out — the thing that carries a team's shared context
 * into its agents' system prompts — never ran in the shipped app: team context
 * was stored and never delivered. These tests pin the fix:
 *
 *  - an OPEN host (`capabilities.profile === "local"`: desktop sidecar,
 *    self-host) gets the real `GET`/`PUT /v1/workspaces/:id/sidebar-layout`,
 *    addressed by the SERVER's workspace id, never the synthetic "default";
 *  - the gateway-fronted cloud (`profile === "cloud"`) does not serve that
 *    route, so it stays device-local and issues no layout request at all;
 *  - a pre-existing device layout is lifted UP to an empty host exactly once;
 *  - a host that predates the route (404) degrades to `localStorage` for the
 *    session instead of failing every drag.
 */

const originalFetch = globalThis.fetch;

let store: Map<string, string>;
let calls: { url: string; method: string; body?: string }[];

beforeEach(() => {
  store = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  calls = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function stubFetch(...responses: Response[]) {
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
    });
    const next = responses.shift();
    if (!next) throw new Error("stubFetch: no responses left");
    return next;
  }) as unknown as typeof fetch;
}

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const LOCAL_KEY = "houston.sidebar-layout.default";
const CAPS_URL = "http://host/v1/capabilities";
const LIST_URL = "http://host/v1/workspaces";
const LAYOUT_URL = "http://host/v1/workspaces/Personal/sidebar-layout";

const localCaps = { profile: "local" };
const cloudCaps = { profile: "cloud" };
const workspaces = [
  { id: "Personal", name: "Personal", isDefault: true, createdAt: "0" },
];

const EMPTY = { groups: [], ungroupedOrder: [] };
const WITH_CONTEXT = {
  groups: [
    {
      id: "grp-work",
      name: "Work",
      collapsed: false,
      agentIds: ["a1"],
      context: "We ship on Fridays.",
    },
  ],
  ungroupedOrder: ["a2"],
};

const client = () =>
  new HoustonClient({ baseUrl: "http://host", token: "t", controlPlane: true });

// ── the pure migration decision ─────────────────────────────────────────────

test("an empty layout is any layout carrying no arrangement at all", () => {
  expect(isEmptySidebarLayout(EMPTY)).toBe(true);
  expect(isEmptySidebarLayout({ ...EMPTY, ungroupedOrder: ["a1"] })).toBe(
    false,
  );
  expect(isEmptySidebarLayout({ ...EMPTY, defaultCollapsed: true })).toBe(
    false,
  );
  expect(isEmptySidebarLayout({ ...EMPTY, defaultContext: "hi" })).toBe(false);
  // Blank text is not context, exactly as the host's own normalization reads it.
  expect(isEmptySidebarLayout({ ...EMPTY, defaultContext: "  " })).toBe(true);
});

test("the seed fires only into an empty host, and only from a real local layout", () => {
  expect(shouldSeedHostLayout(EMPTY, WITH_CONTEXT)).toBe(true);
  expect(shouldSeedHostLayout(WITH_CONTEXT, WITH_CONTEXT)).toBe(false);
  expect(shouldSeedHostLayout(EMPTY, EMPTY)).toBe(false);
});

// ── open host: the layout is the host's ─────────────────────────────────────

test("an open host serves the layout, addressed by the SERVER's workspace id", async () => {
  stubFetch(json(200, localCaps), json(200, workspaces), json(200, EMPTY));

  const layout = await client().getSidebarLayout("default");

  expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
    `GET ${CAPS_URL}`,
    `GET ${LIST_URL}`,
    `GET ${LAYOUT_URL}`,
  ]);
  expect(layout).toEqual(EMPTY);
});

test("a team-context write PUTs to the host, so GROUP.md sync actually runs", async () => {
  stubFetch(
    json(200, localCaps),
    json(200, workspaces),
    json(200, WITH_CONTEXT),
  );

  const saved = await client().setSidebarLayout("default", WITH_CONTEXT);

  const put = calls.at(-1);
  expect(put?.method).toBe("PUT");
  expect(put?.url).toBe(LAYOUT_URL);
  // The body the host diffs to decide whose GROUP.md is rewritten.
  expect(JSON.parse(put?.body ?? "{}")).toEqual(WITH_CONTEXT);
  expect(saved).toEqual(WITH_CONTEXT);
  // Nothing left behind on the device to drift from the host's copy.
  expect(store.get(LOCAL_KEY)).toBeUndefined();
});

test("the deployment is probed once, not per layout call", async () => {
  stubFetch(
    json(200, localCaps),
    json(200, workspaces),
    json(200, WITH_CONTEXT),
    json(200, WITH_CONTEXT),
  );

  const c = client();
  await c.getSidebarLayout("default");
  await c.getSidebarLayout("default");

  expect(calls.filter((x) => x.url === CAPS_URL)).toHaveLength(1);
  expect(calls.filter((x) => x.url === LIST_URL)).toHaveLength(1);
});

// ── gateway-fronted cloud: the layout stays on the device ───────────────────

test("a gateway-fronted host never touches the layout route", async () => {
  stubFetch(json(200, cloudCaps));

  const c = client();
  await c.setSidebarLayout("default", WITH_CONTEXT);
  const layout = await c.getSidebarLayout("default");

  // One probe for the client's lifetime, and nothing else on the wire.
  expect(calls.map((x) => x.url)).toEqual([CAPS_URL]);
  expect(layout).toEqual(WITH_CONTEXT);
  expect(JSON.parse(store.get(LOCAL_KEY) ?? "{}")).toEqual(WITH_CONTEXT);
});

test("the one-time lift never runs on a gateway-fronted host", async () => {
  store.set(LOCAL_KEY, JSON.stringify(WITH_CONTEXT));
  stubFetch(json(200, cloudCaps));

  await client().getSidebarLayout("default");

  expect(calls.every((x) => x.method === "GET" && x.url === CAPS_URL)).toBe(
    true,
  );
});

// ── the one-time lift ───────────────────────────────────────────────────────

test("a device layout is lifted onto an EMPTY host exactly once", async () => {
  store.set(LOCAL_KEY, JSON.stringify(WITH_CONTEXT));
  stubFetch(
    json(200, localCaps),
    json(200, workspaces),
    json(200, EMPTY), // the host has never stored one
    json(200, WITH_CONTEXT), // the seeding PUT
    json(200, WITH_CONTEXT), // the second read
  );

  const c = client();
  const first = await c.getSidebarLayout("default");
  const second = await c.getSidebarLayout("default");

  expect(first).toEqual(WITH_CONTEXT);
  expect(second).toEqual(WITH_CONTEXT);
  expect(calls.filter((x) => x.method === "PUT")).toEqual([
    { url: LAYOUT_URL, method: "PUT", body: JSON.stringify(WITH_CONTEXT) },
  ]);
  // The device copy is gone, so the lift can never re-run from here.
  expect(store.get(LOCAL_KEY)).toBeUndefined();
});

test("a non-empty host layout is never overwritten by a stale device copy", async () => {
  store.set(LOCAL_KEY, JSON.stringify(WITH_CONTEXT));
  const hosted = { groups: [], ungroupedOrder: ["a9"] };
  stubFetch(json(200, localCaps), json(200, workspaces), json(200, hosted));

  const layout = await client().getSidebarLayout("default");

  expect(layout).toEqual(hosted);
  expect(calls.filter((x) => x.method === "PUT")).toEqual([]);
  // Untouched: it is the lifeboat if this host later turns out to be stale.
  expect(store.get(LOCAL_KEY)).toBe(JSON.stringify(WITH_CONTEXT));
});

// ── the stale-host degrade ──────────────────────────────────────────────────

test("a host without the route degrades to the device for the session", async () => {
  store.set(LOCAL_KEY, JSON.stringify(WITH_CONTEXT));
  stubFetch(
    json(200, localCaps),
    json(200, workspaces),
    json(404, { error: "not found" }),
  );

  const c = client();
  expect(await c.getSidebarLayout("default")).toEqual(WITH_CONTEXT);
  // And the write that follows does not retry the dead route.
  const next = { ...WITH_CONTEXT, ungroupedOrder: ["a2", "a3"] };
  expect(await c.setSidebarLayout("default", next)).toEqual(next);

  expect(calls.filter((x) => x.url === LAYOUT_URL)).toHaveLength(1);
  expect(JSON.parse(store.get(LOCAL_KEY) ?? "{}")).toEqual(next);
});

test("a failed write that is NOT a 404 surfaces instead of vanishing", async () => {
  stubFetch(
    json(200, localCaps),
    json(200, workspaces),
    json(500, { error: "boom" }),
  );

  await expect(
    client().setSidebarLayout("default", WITH_CONTEXT),
  ).rejects.toThrow();
});
