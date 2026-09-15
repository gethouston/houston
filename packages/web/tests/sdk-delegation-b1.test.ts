import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";

/**
 * Migration wave B1 — the workspaces family moves from the adapter's `cp/*`
 * copies to `sdk.workspaces`, and the wire may not move with it.
 *
 * The control-plane helpers these calls replaced are gone, so the request each
 * one issued is pinned HERE instead of diffed against a surviving copy: the
 * whole URL, the verb, the body bytes, and the three headers the gateway acts
 * on (`Content-Type` from the transport, `Authorization` + `x-houston-org`
 * from the shared auth fetch). Both transports stamp a JSON content type on
 * every request, so unlike the preferences read (wave 0) there is no header
 * difference left to account for.
 *
 * Percent-encoding is pinned wherever an id or a document path is spliced into
 * the address — an agent named `a/b` must not reach a different agent's file.
 */

const BASE = "http://host";
const ORG = "abcdef0123456789"; // [a-f0-9]{16}

interface Call {
  url: string;
  method: string;
  body: string | null;
  headers: Headers;
}

let calls: Call[];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  const store = new Map<string, string>();
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

const json = (status: number, body: unknown = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Record every request and answer it from `route`. A path the test did not
 * arrange throws the transport-shaped failure a dead endpoint would, so an
 * unexpected call cannot pass as a silent success.
 */
function stubFetch(route: (path: string) => Response | undefined) {
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: (init?.method ?? "GET").toUpperCase(),
      body: typeof init?.body === "string" ? init.body : null,
      headers: new Headers(init?.headers),
    });
    const res = route(new URL(url).pathname);
    if (!res) throw new TypeError(`not stubbed: ${url}`);
    return res;
  }) as unknown as typeof fetch;
}

const client = () => {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG);
  return c;
};

/** The one request under test, with its auth + content headers spelled out. */
function only(): Call {
  expect(calls).toHaveLength(1);
  const [call] = calls;
  expect(call.headers.get("Content-Type")).toBe("application/json");
  expect(call.headers.get("Authorization")).toBe("Bearer t");
  expect(call.headers.get("x-houston-org")).toBe(ORG);
  return call;
}

describe("the delegated workspace list", () => {
  test("issues one GET /v1/workspaces", async () => {
    stubFetch((path) =>
      path === "/v1/workspaces" ? json(200, [{ id: "ws" }]) : undefined,
    );

    await client().listWorkspaces();

    // The provider probe that labels the synthetic personal row is not stubbed
    // and fails harmlessly, so the list read is the only request on the wire.
    const list = calls.filter((c) => c.url === `${BASE}/v1/workspaces`);
    expect(list).toHaveLength(1);
    expect(list[0].method).toBe("GET");
    expect(list[0].body).toBeNull();
    expect(list[0].headers.get("Content-Type")).toBe("application/json");
    expect(list[0].headers.get("Authorization")).toBe("Bearer t");
    expect(list[0].headers.get("x-houston-org")).toBe(ORG);
  });
});

describe("the delegated agent-document reads and writes", () => {
  test("a read unwraps {content} off the agent's agentfile route", async () => {
    stubFetch(() => json(200, { content: "# Learnings" }));

    expect(await client().readAgentFile("ag1", ".houston/learnings.md")).toBe(
      "# Learnings",
    );

    const call = only();
    expect(call.url).toBe(`${BASE}/agents/ag1/agentfile/.houston/learnings.md`);
    expect(call.method).toBe("GET");
    expect(call.body).toBeNull();
  });

  test("the agent id is escaped and the document path keeps its separators", async () => {
    stubFetch(() => json(200, { content: "x" }));

    await client().readAgentFile("Team A/ag 1", "notes/a b.md");

    expect(only().url).toBe(
      `${BASE}/agents/Team%20A%2Fag%201/agentfile/notes/a%20b.md`,
    );
  });

  test("a write PUTs the content as the body it always did", async () => {
    stubFetch(() => json(200, {}));

    await client().writeAgentFile("ag1", "notes/a.md", "hello");

    const call = only();
    expect(call.url).toBe(`${BASE}/agents/ag1/agentfile/notes/a.md`);
    expect(call.method).toBe("PUT");
    expect(call.body).toBe(JSON.stringify({ content: "hello" }));
  });
});

describe("the delegated conversation context", () => {
  test("reads both slots, each off its own resource", async () => {
    stubFetch(() => json(200, { content: "notes" }));

    expect(await client().getWorkspaceContext("ag1")).toEqual({
      workspace: "notes",
      user: "notes",
    });

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET ${BASE}/v1/workspace-context`,
      `GET ${BASE}/v1/user-context`,
    ]);
    expect(calls.every((c) => c.body === null)).toBe(true);
  });

  test("a slot write PUTs {content} to that slot's resource", async () => {
    stubFetch(() => json(200, {}));

    await client().setWorkspaceContextSlot("ag1", "user", "mine");

    const call = only();
    expect(call.url).toBe(`${BASE}/v1/user-context`);
    expect(call.method).toBe("PUT");
    expect(call.body).toBe(JSON.stringify({ content: "mine" }));
  });
});

describe("the delegated sidebar layout", () => {
  const LAYOUT = { groups: [], ungroupedOrder: ["a1"] };
  /** An open host (the only deployment that serves the layout route) whose
   *  personal workspace answers to the SERVER id, never the synthetic one. */
  const openHost = (layout: () => Response) =>
    stubFetch((path) => {
      if (path === "/v1/capabilities") return json(200, { profile: "local" });
      if (path === "/v1/workspaces")
        return json(200, [{ id: "Personal", isDefault: true }]);
      if (path === "/v1/workspaces/Personal/sidebar-layout") return layout();
      return undefined;
    });

  test("reads the layout under the server's workspace id", async () => {
    openHost(() => json(200, LAYOUT));

    expect(await client().getSidebarLayout("default")).toEqual(LAYOUT);

    const call = calls.find((c) => c.url.endsWith("/sidebar-layout"));
    expect(call?.url).toBe(`${BASE}/v1/workspaces/Personal/sidebar-layout`);
    expect(call?.method).toBe("GET");
    expect(call?.body).toBeNull();
    expect(call?.headers.get("Content-Type")).toBe("application/json");
    expect(call?.headers.get("Authorization")).toBe("Bearer t");
    expect(call?.headers.get("x-houston-org")).toBe(ORG);
  });

  test("a save PUTs the layout verbatim and adopts the host's copy", async () => {
    openHost(() => json(200, LAYOUT));

    expect(await client().setSidebarLayout("default", LAYOUT)).toEqual(LAYOUT);

    const call = calls.find((c) => c.method === "PUT");
    expect(call?.url).toBe(`${BASE}/v1/workspaces/Personal/sidebar-layout`);
    expect(call?.body).toBe(JSON.stringify(LAYOUT));
  });

  test("a 404 still degrades to this device — the status survives the SDK", async () => {
    openHost(() => json(404, { error: "not found" }));

    expect(await client().getSidebarLayout("default")).toEqual({
      groups: [],
      ungroupedOrder: [],
    });
  });
});
