import type { SidebarLayout } from "@houston/engine-adapter";
import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  type Call,
  createWireCapture,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

const BASE = "http://host";

const { calls, reset, restore, stubRouted } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

function stubFetch(route: (path: string) => Response | undefined) {
  stubRouted((call) => {
    const res = route(new URL(call.url).pathname);
    if (!res) throw new TypeError(`not stubbed: ${call.url}`);
    return res;
  });
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

function only(): Call {
  expect(calls).toHaveLength(1);
  const [call] = calls;
  expect(call.headers.get("Content-Type")).toBe("application/json");
  expect(call.headers.get("Authorization")).toBe("Bearer t");
  expect(call.headers.get("x-houston-org")).toBe(ORG);
  return call;
}

describe("the delegated workspace list", () => {
  test("is one GET /v1/workspaces and nothing else", async () => {
    stubFetch((path) =>
      path === "/v1/workspaces" ? json(200, [{ id: "ws" }]) : json(404, {}),
    );

    const spaces = await client().listWorkspaces();

    expect(spaces.map((w) => w.id)).toEqual(["default"]);
    const call = only();
    expect(call.url).toBe(`${BASE}/v1/workspaces`);
    expect(call.method).toBe("GET");
    expect(call.body).toBeNull();
  });

  test("the personal row carries no provider label", async () => {
    stubFetch(() => json(200, []));

    const [personal] = await client().listWorkspaces();

    expect(personal).not.toHaveProperty("provider");
    expect(personal).not.toHaveProperty("model");
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
  const LAYOUT = {
    groups: [{ id: "g", name: "Ops", collapsed: false, agentIds: ["inside"] }],
    order: [
      { kind: "agent", id: "a1" },
      { kind: "group", id: "g" },
    ],
  } satisfies SidebarLayout;
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
    expect(call?.headers.get("x-houston-org")).toBeNull();
  });

  test("a save PUTs the layout verbatim and adopts the host's copy", async () => {
    openHost(() => json(200, LAYOUT));

    expect(await client().setSidebarLayout("default", LAYOUT)).toEqual(LAYOUT);

    const call = calls.find((c) => c.method === "PUT");
    expect(call?.url).toBe(`${BASE}/v1/workspaces/Personal/sidebar-layout`);
    expect(call?.body).toBe(JSON.stringify(LAYOUT));
  });

  test("a 404 rejects with the route status", async () => {
    openHost(() => json(404, { error: "not found" }));

    await expect(client().getSidebarLayout("default")).rejects.toMatchObject({
      status: 404,
    });
  });

  test("a local host lifts a device layout once and clears the key", async () => {
    const old = {
      groups: [
        {
          id: "g",
          name: "Ops",
          collapsed: false,
          agentIds: ["inside"],
          context: "legacy",
        },
      ],
      ungroupedOrder: ["a1"],
    };
    localStorage.setItem("houston.sidebar-layout.default", JSON.stringify(old));
    stubFetch((path) => {
      if (path === "/v1/capabilities") return json(200, { profile: "local" });
      if (path === "/v1/workspaces")
        return json(200, [{ id: "Personal", isDefault: true }]);
      if (path.endsWith("/sidebar-layout"))
        return json(
          200,
          calls.at(-1)?.method === "PUT" ? LAYOUT : { groups: [], order: [] },
        );
      return undefined;
    });
    await client().getSidebarLayout("default");
    const put = calls.find((call) => call.method === "PUT");
    expect(JSON.parse(put?.body ?? "null")).toEqual({
      groups: [
        { id: "g", name: "Ops", collapsed: false, agentIds: ["inside"] },
      ],
      order: [
        { kind: "group", id: "g" },
        { kind: "agent", id: "a1" },
      ],
    });
    expect(localStorage.getItem("houston.sidebar-layout.default")).toBeNull();
    await client().getSidebarLayout("default");
    expect(calls.filter((call) => call.method === "PUT")).toHaveLength(1);
  });

  test("a device layout the local host rejects is reported, cleared and never retried", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem(
      "houston.sidebar-layout.default",
      JSON.stringify(LAYOUT),
    );
    stubFetch((path) => {
      if (path === "/v1/capabilities") return json(200, { profile: "local" });
      if (path === "/v1/workspaces")
        return json(200, [{ id: "Personal", isDefault: true }]);
      if (path.endsWith("/sidebar-layout"))
        return calls.at(-1)?.method === "PUT"
          ? json(400, { error: "invalid sidebar layout" })
          : json(200, { groups: [], order: [] });
      return undefined;
    });
    const c = client();
    expect(await c.getSidebarLayout("default")).toEqual({
      groups: [],
      order: [],
    });
    expect(error).toHaveBeenCalled();
    expect(localStorage.getItem("houston.sidebar-layout.default")).toBeNull();
    await c.getSidebarLayout("default");
    expect(calls.filter((call) => call.method === "PUT")).toHaveLength(1);
  });

  test("a failed capabilities probe skips the lift and retries it next read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem(
      "houston.sidebar-layout.default",
      JSON.stringify(LAYOUT),
    );
    let probeUp = false;
    stubFetch((path) => {
      if (path === "/v1/capabilities")
        return probeUp
          ? json(200, { profile: "local" })
          : json(500, { error: "boom" });
      if (path === "/v1/workspaces")
        return json(200, [{ id: "Personal", isDefault: true }]);
      if (path.endsWith("/sidebar-layout"))
        return json(
          200,
          calls.at(-1)?.method === "PUT" ? LAYOUT : { groups: [], order: [] },
        );
      return undefined;
    });
    const c = client();
    expect(await c.getSidebarLayout("default")).toEqual({
      groups: [],
      order: [],
    });
    expect(
      localStorage.getItem("houston.sidebar-layout.default"),
    ).not.toBeNull();
    probeUp = true;
    expect(await c.getSidebarLayout("default")).toEqual(LAYOUT);
    expect(localStorage.getItem("houston.sidebar-layout.default")).toBeNull();
  });

  test("a cloud gateway discards the old device overlay", async () => {
    localStorage.setItem(
      "houston.sidebar-layout.org:abc",
      JSON.stringify(LAYOUT),
    );
    stubFetch((path) =>
      path === "/v1/capabilities"
        ? json(200, { profile: "cloud" })
        : path.endsWith("/sidebar-layout")
          ? json(200, LAYOUT)
          : undefined,
    );
    await client().getSidebarLayout("org:abc");
    expect(calls.filter((call) => call.method === "PUT")).toEqual([]);
    expect(localStorage.getItem("houston.sidebar-layout.org:abc")).toBeNull();
  });
});
