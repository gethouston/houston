import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import {
  type SidebarLayout,
  WorkspacesCommand,
  WorkspacesHttpError,
} from "./index";

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  url: string;
  body: string | null;
}

const WORKSPACE = {
  id: "Personal",
  name: "Personal",
  isDefault: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const LAYOUT: SidebarLayout = {
  groups: [{ id: "g1", name: "Ops", collapsed: false, agentIds: ["a1"] }],
  order: [
    { kind: "agent", id: "a2" },
    { kind: "group", id: "g1" },
  ],
};

/**
 * A workspaces SDK over a mock `fetch` that records the whole wire.
 * `reactivity` is off, so every recorded call is one a workspaces operation
 * made and nothing else — which is what makes "exactly one request" exact.
 */
function makeSdk(answer: (path: string) => Response) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      calls.push({
        method: init?.method ?? "GET",
        url,
        body: typeof init?.body === "string" ? init.body : null,
      });
      return answer(new URL(url).pathname);
    },
  );
  const store = new Map<string, string>();
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: memoryKv(store),
    devicePreferences: memoryKv(),
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = { baseUrl: BASE, ports, reactivity: false };
  return { sdk: new HoustonSdk(config), calls };
}

const json = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: status === 204 ? {} : { "content-type": "application/json" },
  });

const ok = (body: unknown) => makeSdk(() => json(body));

describe("the workspaces requests", () => {
  it("lists the workspaces off GET /v1/workspaces", async () => {
    const { sdk, calls } = ok([WORKSPACE]);
    expect(await sdk.workspaces.listWorkspaces()).toEqual([WORKSPACE]);
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/workspaces`, body: null },
    ]);
  });

  it("unwraps an agent document's {content} envelope", async () => {
    const { sdk, calls } = ok({ content: "# Board" });
    expect(
      await sdk.workspaces.readAgentFile("ag 1", ".houston/board.md"),
    ).toBe("# Board");
    expect(calls).toEqual([
      {
        method: "GET",
        url: `${BASE}/agents/ag%201/agentfile/.houston/board.md`,
        body: null,
      },
    ]);
  });

  it("keeps a document path's separators while escaping each part", async () => {
    const { sdk, calls } = ok({ content: "x" });
    await sdk.workspaces.writeAgentFile("ag/1", "a b/c#d.md", "x");
    expect(calls).toEqual([
      {
        method: "PUT",
        url: `${BASE}/agents/ag%2F1/agentfile/a%20b/c%23d.md`,
        body: JSON.stringify({ content: "x" }),
      },
    ]);
  });

  it("addresses each context slot by its own resource", async () => {
    const { sdk, calls } = ok({ content: "notes" });
    expect(await sdk.workspaces.getContext("workspace")).toBe("notes");
    await sdk.workspaces.setContext("user", "mine");
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/workspace-context`, body: null },
      {
        method: "PUT",
        url: `${BASE}/v1/user-context`,
        body: JSON.stringify({ content: "mine" }),
      },
    ]);
  });

  it("reads and writes a sidebar layout under the workspace's id", async () => {
    const { sdk, calls } = ok(LAYOUT);
    expect(await sdk.workspaces.getSidebarLayout("org:abc")).toEqual(LAYOUT);
    expect(await sdk.workspaces.setSidebarLayout("org:abc", LAYOUT)).toEqual(
      LAYOUT,
    );
    expect(calls).toEqual([
      {
        method: "GET",
        url: `${BASE}/v1/workspaces/org%3Aabc/sidebar-layout`,
        body: null,
      },
      {
        method: "PUT",
        url: `${BASE}/v1/workspaces/org%3Aabc/sidebar-layout`,
        body: JSON.stringify(LAYOUT),
      },
    ]);
  });

  it("throws the module's own error, carrying the status, on a non-2xx", async () => {
    const { sdk } = makeSdk(() => json({ error: "nope" }, 404));
    await expect(sdk.workspaces.getSidebarLayout("w1")).rejects.toThrow(
      WorkspacesHttpError,
    );
    await expect(sdk.workspaces.getSidebarLayout("w1")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("the workspaces commands", () => {
  it("dispatch the same handlers the facade calls", async () => {
    const { sdk, calls } = ok({ content: "notes" });
    const result = await sdk.dispatch({
      id: "1",
      type: WorkspacesCommand.GetContext,
      payload: { kind: "workspace" },
    });
    expect(result).toMatchObject({ ok: true, value: "notes" });
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/workspace-context`, body: null },
    ]);
  });

  it("refuse a context slot outside the union rather than address one", async () => {
    const { sdk, calls } = ok({ content: "notes" });
    const result = await sdk.dispatch({
      id: "2",
      type: WorkspacesCommand.SetContext,
      payload: { kind: "../secrets", content: "x" },
    });
    expect(result).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
  });

  it("refuse a layout that is not the shape the host validates", async () => {
    const { sdk, calls } = ok(LAYOUT);
    const result = await sdk.dispatch({
      id: "3",
      type: WorkspacesCommand.SetSidebarLayout,
      payload: { workspaceId: "w1", layout: { groups: [] } },
    });
    expect(result).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
  });

  it("refuses an invalid root entry before making a request", async () => {
    const { sdk, calls } = ok(LAYOUT);
    const result = await sdk.dispatch({
      id: "4",
      type: WorkspacesCommand.SetSidebarLayout,
      payload: {
        workspaceId: "w1",
        layout: { groups: [], order: [{ kind: "nested", id: "g" }] },
      },
    });
    expect(result).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
  });

  it("refuses malformed group fields before making a request", async () => {
    for (const group of [
      { id: 1, name: "Ops", collapsed: false, agentIds: [] },
      { id: "g", name: null, collapsed: false, agentIds: [] },
      { id: "g", name: "Ops", collapsed: "no", agentIds: [] },
      { id: "g", name: "Ops", collapsed: false, agentIds: [1] },
      { id: "g", name: "Ops", collapsed: false, agentIds: [], icon: 2 },
      { id: "g", name: "Ops", collapsed: false, agentIds: [], color: false },
    ]) {
      const { sdk, calls } = ok(LAYOUT);
      const result = await sdk.dispatch({
        id: "bad",
        type: WorkspacesCommand.SetSidebarLayout,
        payload: { workspaceId: "w1", layout: { groups: [group], order: [] } },
      });
      expect(result).toMatchObject({ ok: false });
      expect(calls).toEqual([]);
    }
  });
  it("refuses a layout the host's strict parser rejects before making a request", async () => {
    const group = { id: "g", name: "Ops", collapsed: false, agentIds: [] };
    for (const layout of [
      { groups: [{ ...group, name: "x".repeat(61) }], order: [] },
      { groups: [group, group], order: [] },
      { groups: [{ ...group, id: "" }], order: [] },
      { groups: [group], order: [{ kind: "group", id: "missing" }] },
    ]) {
      const { sdk, calls } = ok(LAYOUT);
      const result = await sdk.dispatch({
        id: "limits",
        type: WorkspacesCommand.SetSidebarLayout,
        payload: { workspaceId: "w1", layout },
      });
      expect(result).toMatchObject({ ok: false });
      expect(calls).toEqual([]);
    }
  });
});
