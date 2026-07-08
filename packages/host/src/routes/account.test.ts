import type { Server } from "node:http";
import type {
  Capabilities,
  HoustonEvent,
  SidebarLayout,
  Workspace,
} from "@houston/protocol";
import { afterAll, beforeAll, expect, test } from "vitest";
import { ProxyChannel } from "../channel/proxy";
import { MemoryCredentialStore } from "../credentials/store";
import type { EventHub } from "../events/hub";
import type { RuntimeEndpoint, RuntimeLauncher, TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";

/**
 * Workspaces + preferences: the user-level resources the host owns (the last
 * domain surfaces the web adapter fakes in localStorage). Scoped to the
 * caller's own personal workspace; another user is walled off.
 */

const verifier: TokenVerifier = {
  async verify(b) {
    return b.startsWith("tok:") ? { userId: b.slice(4) } : null;
  },
};
const launcher: RuntimeLauncher = {
  async ensureAwake(): Promise<RuntimeEndpoint> {
    return { baseUrl: "http://unused", token: "t" };
  },
  async sleep() {},
  async destroy() {},
  async status() {
    return "running";
  },
};
const CAPS: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: ["openai-codex"],
  openaiCompatible: false,
  integrations: [],
};
const store = new MemoryWorkspaceStore();
const credentials = new MemoryCredentialStore();
const vfs = new MemoryVfs();

const deps = (over: Partial<ControlPlaneDeps> = {}): ControlPlaneDeps => ({
  verifier,
  store,
  credentials,
  vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
  channels: {
    gke: new ProxyChannel({
      launcher,
      proxy: { async forward() {} },
      credentials,
      forwardActingHeader: false,
    }),
  },
  vfs,
  capabilities: CAPS,
  ...over,
});

let server: Server;
let base = "";
const auth = (who: string) => ({
  Authorization: `Bearer tok:${who}`,
  "Content-Type": "application/json",
});

beforeAll(async () => {
  server = createControlPlaneServer(deps());
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

test("GET /v1/workspaces returns the caller's personal workspace in wire shape", async () => {
  const r = await fetch(`${base}/v1/workspaces`, { headers: auth("alice") });
  expect(r.status).toBe(200);
  const list = (await r.json()) as Workspace[];
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ isDefault: true, locale: null });
  expect(typeof list[0]?.createdAt).toBe("string");
  // No tenancy internals leak to the wire.
  expect(JSON.stringify(list[0])).not.toContain("slug");
  expect(JSON.stringify(list[0])).not.toContain("runtime");
});

test("preferences round-trip per user, and locale shows up on the workspace", async () => {
  const put = await fetch(`${base}/v1/preferences/locale`, {
    method: "PUT",
    headers: auth("alice"),
    body: JSON.stringify({ value: "es" }),
  });
  expect(put.status).toBe(200);
  expect(((await put.json()) as { value: string }).value).toBe("es");

  const get = await fetch(`${base}/v1/preferences/locale`, {
    headers: auth("alice"),
  });
  expect(((await get.json()) as { value: string }).value).toBe("es");

  const ws = (await (
    await fetch(`${base}/v1/workspaces`, { headers: auth("alice") })
  ).json()) as Workspace[];
  expect(ws[0]?.locale).toBe("es");
});

test("one user's preferences never leak to another", async () => {
  await fetch(`${base}/v1/preferences/timezone`, {
    method: "PUT",
    headers: auth("alice"),
    body: JSON.stringify({ value: "America/Bogota" }),
  });
  const bob = await fetch(`${base}/v1/preferences/timezone`, {
    headers: auth("bob"),
  });
  expect(((await bob.json()) as { value: string | null }).value).toBeNull();
});

test("PATCH /v1/workspaces/:id sets locale; a non-owner is walled off (403)", async () => {
  const aliceWsList = (await (
    await fetch(`${base}/v1/workspaces`, { headers: auth("alice") })
  ).json()) as Workspace[];
  const aliceWs = aliceWsList[0];
  if (!aliceWs) throw new Error("expected alice to have a workspace");

  const patched = await fetch(`${base}/v1/workspaces/${aliceWs.id}`, {
    method: "PATCH",
    headers: auth("alice"),
    body: JSON.stringify({ locale: "pt" }),
  });
  expect(patched.status).toBe(200);
  expect(((await patched.json()) as Workspace).locale).toBe("pt");

  const byBob = await fetch(`${base}/v1/workspaces/${aliceWs.id}`, {
    method: "PATCH",
    headers: auth("bob"),
    body: JSON.stringify({ locale: "en" }),
  });
  expect(byBob.status).toBe(403);
});

test("preference routes 503 without a vfs", async () => {
  const noVfs = createControlPlaneServer(deps({ vfs: undefined }));
  await new Promise<void>((r) => noVfs.listen(0, "127.0.0.1", () => r()));
  const addr = noVfs.address();
  const b = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  try {
    const r = await fetch(`${b}/v1/preferences/locale`, {
      headers: auth("alice"),
    });
    expect(r.status).toBe(503);
    await r.text();
  } finally {
    await new Promise<void>((r) => noVfs.close(() => r()));
  }
});

/** The caller's (auto-provisioned) personal workspace id. */
async function wsIdOf(who: string): Promise<string> {
  const list = (await (
    await fetch(`${base}/v1/workspaces`, { headers: auth(who) })
  ).json()) as Workspace[];
  const id = list[0]?.id;
  if (!id) throw new Error(`expected ${who} to have a workspace`);
  return id;
}

const LAYOUT: SidebarLayout = {
  groups: [
    { id: "g1", name: "Work", collapsed: false, agentIds: ["a1", "a2"] },
  ],
  ungroupedOrder: ["a3"],
};

test("GET sidebar-layout returns the default when unset", async () => {
  const id = await wsIdOf("dave");
  const r = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    headers: auth("dave"),
  });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({
    groups: [],
    ungroupedOrder: [],
  });
});

test("PUT sidebar-layout persists and GET round-trips it", async () => {
  const id = await wsIdOf("erin");
  const put = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("erin"),
    body: JSON.stringify(LAYOUT),
  });
  expect(put.status).toBe(200);
  expect(await put.json()).toEqual(LAYOUT);

  const get = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    headers: auth("erin"),
  });
  expect(await get.json()).toEqual(LAYOUT);
});

test("PUT sidebar-layout with an invalid body is a 400", async () => {
  const id = await wsIdOf("frank");
  const bad = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("frank"),
    body: JSON.stringify({
      groups: "not-an-array",
      ungroupedOrder: [],
    }),
  });
  expect(bad.status).toBe(400);
  expect(((await bad.json()) as { error: string }).error).toBe(
    "invalid sidebar layout",
  );
});

test("PUT sidebar-layout emits SidebarLayoutChanged to the owner", async () => {
  const emitted: { userId: string; event: HoustonEvent }[] = [];
  const events: EventHub = {
    emit: (userId, event) => emitted.push({ userId, event }),
    subscribe: () => () => {},
  };
  const srv = createControlPlaneServer(deps({ events }));
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const addr = srv.address();
  const b = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  try {
    const list = (await (
      await fetch(`${b}/v1/workspaces`, { headers: auth("grace") })
    ).json()) as Workspace[];
    const id = list[0]?.id;
    if (!id) throw new Error("expected grace to have a workspace");
    const put = await fetch(`${b}/v1/workspaces/${id}/sidebar-layout`, {
      method: "PUT",
      headers: auth("grace"),
      body: JSON.stringify(LAYOUT),
    });
    expect(put.status).toBe(200);
    await put.json();
    expect(emitted).toEqual([
      {
        userId: "grace",
        event: { type: "SidebarLayoutChanged", workspaceId: id },
      },
    ]);
  } finally {
    await new Promise<void>((r) => srv.close(() => r()));
  }
});

test("sidebar-layout is walled off from a non-owner (403)", async () => {
  const id = await wsIdOf("heidi");
  const byBob = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("bob"),
    body: JSON.stringify(LAYOUT),
  });
  expect(byBob.status).toBe(403);
  await byBob.text();
});

test("sidebar-layout routes 503 without a vfs", async () => {
  const id = await wsIdOf("ivan");
  const noVfs = createControlPlaneServer(deps({ vfs: undefined }));
  await new Promise<void>((r) => noVfs.listen(0, "127.0.0.1", () => r()));
  const addr = noVfs.address();
  const b = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  try {
    const r = await fetch(`${b}/v1/workspaces/${id}/sidebar-layout`, {
      headers: auth("ivan"),
    });
    expect(r.status).toBe(503);
    await r.text();
  } finally {
    await new Promise<void>((r) => noVfs.close(() => r()));
  }
});
