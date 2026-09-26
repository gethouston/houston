import type { SidebarLayout } from "@houston/engine-adapter";
import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, expect, test, vi } from "vitest";

const originalFetch = globalThis.fetch;
const layout = {
  groups: [
    {
      id: "g1",
      name: "Ops",
      collapsed: false,
      agentIds: ["a1"],
      icon: "star",
      color: "blue",
    },
  ],
  order: [
    { kind: "group", id: "g1" },
    { kind: "agent", id: "a2" },
  ],
} satisfies SidebarLayout;
const calls: Array<{
  url: string;
  method: string;
  headers: Headers;
  body: string | null;
}> = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(workspaceId: string, response: Response): void {
  globalThis.fetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
        body: typeof init?.body === "string" ? init.body : null,
      });
      if (url.endsWith("/v1/workspaces"))
        return json([
          {
            id: workspaceId,
            name: workspaceId,
            isDefault: true,
            createdAt: "0",
          },
        ]);
      if (url.endsWith("/v1/capabilities")) return json({ profile: "cloud" });
      if (url.endsWith("/sidebar-layout")) return response.clone();
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

afterEach(() => {
  globalThis.fetch = originalFetch;
  calls.length = 0;
  vi.restoreAllMocks();
});

for (const workspaceId of ["Personal", "Houston"]) {
  test(`personal sidebar layout uses the served ${workspaceId} id`, async () => {
    stubFetch(workspaceId, json(layout));
    const c = client();
    expect(await c.getSidebarLayout("default")).toEqual(layout);
    expect(await c.setSidebarLayout("default", layout)).toEqual(layout);
    expect(calls.map(({ url, method }) => `${method} ${url}`)).toEqual([
      "GET http://host/v1/workspaces",
      `GET http://host/v1/workspaces/${workspaceId}/sidebar-layout`,
      "GET http://host/v1/capabilities",
      `PUT http://host/v1/workspaces/${workspaceId}/sidebar-layout`,
    ]);
    const get = calls[1];
    const put = calls[3];
    expect(get?.headers.get("Authorization")).toBe("Bearer t");
    expect(get?.headers.get("Content-Type")).toBe("application/json");
    expect(get?.body).toBeNull();
    expect(put?.headers.get("Authorization")).toBe("Bearer t");
    expect(put?.headers.get("Content-Type")).toBe("application/json");
    expect(put?.body).toBe(JSON.stringify(layout));
  });
}

test("team space layout uses its id without resolving the personal space", async () => {
  stubFetch("Houston", json(layout));
  const c = client();
  expect(await c.setSidebarLayout("org:abc", layout)).toEqual(layout);
  expect(calls.map(({ url, method }) => `${method} ${url}`)).toEqual([
    "PUT http://host/v1/workspaces/org%3Aabc/sidebar-layout",
  ]);
  expect(calls[0]?.body).toBe(JSON.stringify(layout));
});

test("queued team layout write keeps its workspace scope after a switch", async () => {
  stubFetch("Houston", json(layout));
  const c = client();
  c.setActiveOrg("aaaaaaaaaaaaaaaa");
  const pending = c.setSidebarLayout("org:aaaaaaaaaaaaaaaa", layout);
  c.setActiveOrg("bbbbbbbbbbbbbbbb");
  await pending;
  expect(
    calls.find((call) => call.method === "PUT")?.headers.get("x-houston-org"),
  ).toBe("aaaaaaaaaaaaaaaa");
});

test("personal layout omits an active team scope", async () => {
  stubFetch("Houston", json(layout));
  const c = client();
  c.setActiveOrg("bbbbbbbbbbbbbbbb");
  await c.getSidebarLayout("default");
  expect(
    calls
      .find((call) => call.url.endsWith("/sidebar-layout"))
      ?.headers.get("x-houston-org"),
  ).toBeNull();
});

test("a missing layout route surfaces its error", async () => {
  stubFetch("Houston", json({ error: "not found" }, 404));
  await expect(client().getSidebarLayout("default")).rejects.toMatchObject({
    status: 404,
  });
});
