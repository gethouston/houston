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
import { CloudPaths } from "../paths";
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
  sharedSkills: false,
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

/**
 * `defaultCollapsed` is the fold state of the DEFAULT team, the one team with
 * no stored group row to hold a `collapsed` of its own. It is ADDITIVE: a
 * layout written before it existed must round-trip byte-identically, which is
 * why the absent case asserts the KEY is missing rather than falsy.
 */
test("PUT sidebar-layout round-trips defaultCollapsed", async () => {
  const id = await wsIdOf("judy");
  const withFlag: SidebarLayout = { ...LAYOUT, defaultCollapsed: true };
  const put = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("judy"),
    body: JSON.stringify(withFlag),
  });
  expect(put.status).toBe(200);
  expect(await put.json()).toEqual(withFlag);

  const get = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    headers: auth("judy"),
  });
  expect(await get.json()).toEqual(withFlag);
});

test("PUT sidebar-layout with a non-boolean defaultCollapsed is a 400", async () => {
  const id = await wsIdOf("karl");
  const bad = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("karl"),
    body: JSON.stringify({ ...LAYOUT, defaultCollapsed: "yes" }),
  });
  expect(bad.status).toBe(400);
  expect(((await bad.json()) as { error: string }).error).toBe(
    "invalid sidebar layout",
  );
});

test("sidebar-layout leaves an absent defaultCollapsed absent", async () => {
  const id = await wsIdOf("liam");
  const put = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("liam"),
    body: JSON.stringify(LAYOUT),
  });
  expect(put.status).toBe(200);
  expect("defaultCollapsed" in (await put.json())).toBe(false);

  const get = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    headers: auth("liam"),
  });
  expect("defaultCollapsed" in (await get.json())).toBe(false);
});

/**
 * `defaultContext` is the DEFAULT team's shared context — the same additive
 * rules as the fold flag above, and STRICT on type like a group's `context`: a
 * present-but-non-string value rejects the whole layout rather than being
 * quietly dropped, because a context that fails to persist is a promise the
 * card already made to the user.
 */
test("PUT sidebar-layout round-trips defaultContext", async () => {
  const id = await wsIdOf("nina");
  const withContext: SidebarLayout = {
    ...LAYOUT,
    defaultContext: "We ship daily.",
  };
  const put = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("nina"),
    body: JSON.stringify(withContext),
  });
  expect(put.status).toBe(200);
  expect(await put.json()).toEqual(withContext);

  const get = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    headers: auth("nina"),
  });
  expect(await get.json()).toEqual(withContext);
});

test("PUT sidebar-layout with a non-string defaultContext is a 400", async () => {
  const id = await wsIdOf("omar");
  const bad = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("omar"),
    body: JSON.stringify({ ...LAYOUT, defaultContext: 42 }),
  });
  expect(bad.status).toBe(400);
  expect(((await bad.json()) as { error: string }).error).toBe(
    "invalid sidebar layout",
  );
});

test("sidebar-layout leaves an absent defaultContext absent", async () => {
  const id = await wsIdOf("pia");
  const put = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("pia"),
    body: JSON.stringify(LAYOUT),
  });
  expect(put.status).toBe(200);
  expect("defaultContext" in (await put.json())).toBe(false);
});

/**
 * A group's `icon` + `color` — the LOCAL half of the team identity C13 stores
 * server-side. STRICT here exactly like `context`: a present-but-non-string
 * value rejects the whole parse rather than being quietly dropped, so a hostile
 * or corrupt layout can never persist. Absent stays absent, which is why the
 * round-trip below asserts the styled object WHOLE.
 */
test("PUT sidebar-layout round-trips a group's icon and color", async () => {
  const id = await wsIdOf("mona");
  const styled: SidebarLayout = {
    ...LAYOUT,
    groups: LAYOUT.groups.map((g) => ({
      ...g,
      icon: "pen-tool",
      color: "#5E6AD2",
    })),
  };
  const put = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("mona"),
    body: JSON.stringify(styled),
  });
  expect(put.status).toBe(200);
  expect(await put.json()).toEqual(styled);

  const get = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    headers: auth("mona"),
  });
  expect(await get.json()).toEqual(styled);
});

test("PUT sidebar-layout with a non-string group icon is a 400", async () => {
  const id = await wsIdOf("nina");
  const bad = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("nina"),
    body: JSON.stringify({
      ...LAYOUT,
      groups: LAYOUT.groups.map((g) => ({ ...g, icon: 7 })),
    }),
  });
  expect(bad.status).toBe(400);
  expect(((await bad.json()) as { error: string }).error).toBe(
    "invalid sidebar layout",
  );
});

test("PUT sidebar-layout with a non-string group color is a 400", async () => {
  const id = await wsIdOf("omar");
  const bad = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("omar"),
    body: JSON.stringify({
      ...LAYOUT,
      groups: LAYOUT.groups.map((g) => ({ ...g, color: false })),
    }),
  });
  expect(bad.status).toBe(400);
  expect(((await bad.json()) as { error: string }).error).toBe(
    "invalid sidebar layout",
  );
});

test("sidebar-layout leaves an absent icon and color absent", async () => {
  const id = await wsIdOf("pia");
  const put = await fetch(`${base}/v1/workspaces/${id}/sidebar-layout`, {
    method: "PUT",
    headers: auth("pia"),
    body: JSON.stringify(LAYOUT),
  });
  expect(put.status).toBe(200);
  const group = ((await put.json()) as SidebarLayout).groups[0] ?? {};
  expect("icon" in group).toBe(false);
  expect("color" in group).toBe(false);
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

/**
 * A group's shared `context` is mirrored to each member agent's own `GROUP.md`
 * on PUT, so the runtime can fold it into that agent's system prompt. The
 * canonical copy is the sidebar_layout pref itself; this file is the derived
 * mirror. Exercised with a real `paths` dep (the default `deps()` omits it, so
 * the sync would no-op — see the last test).
 */
const groupPaths = new CloudPaths();

/** Boot a server with the given deps override; returns its base URL + closer. */
async function startServer(
  over: Partial<ControlPlaneDeps>,
): Promise<{ base: string; close: () => Promise<void> }> {
  const srv = createControlPlaneServer(deps(over));
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const addr = srv.address();
  return {
    base: `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`,
    close: () => new Promise<void>((r) => srv.close(() => r())),
  };
}

/** The vfs key an agent's GROUP.md lands at under the cloud layout. */
async function groupFileKey(wsId: string, agentId: string): Promise<string> {
  const ws = await store.getWorkspace(wsId);
  const agent = await store.getAgent(agentId);
  if (!ws || !agent) throw new Error("expected ws + agent to exist");
  return `${groupPaths.agentRoot(ws, agent)}/GROUP.md`;
}

async function putLayout(
  b: string,
  who: string,
  wsId: string,
  layout: SidebarLayout,
): Promise<Response> {
  return fetch(`${b}/v1/workspaces/${wsId}/sidebar-layout`, {
    method: "PUT",
    headers: auth(who),
    body: JSON.stringify(layout),
  });
}

test("PUT a group with context writes GROUP.md into each member agent", async () => {
  const { base: b, close } = await startServer({ paths: groupPaths });
  try {
    const wsId = await wsIdOf("greg");
    const agent = await store.createAgent({ workspaceId: wsId, name: "Ada" });
    const put = await putLayout(b, "greg", wsId, {
      groups: [
        {
          id: "g1",
          name: "Ops",
          collapsed: false,
          agentIds: [agent.id],
          context: "  reply in French  ",
        },
      ],
      ungroupedOrder: [],
    });
    expect(put.status).toBe(200);
    await put.json();
    expect(await vfs.readText(await groupFileKey(wsId, agent.id))).toBe(
      "reply in French",
    );
  } finally {
    await close();
  }
});

test("editing a group's context updates the member's GROUP.md", async () => {
  const { base: b, close } = await startServer({ paths: groupPaths });
  try {
    const wsId = await wsIdOf("gwen");
    const agent = await store.createAgent({ workspaceId: wsId, name: "Bo" });
    const g = (context: string): SidebarLayout => ({
      groups: [
        {
          id: "g1",
          name: "Ops",
          collapsed: false,
          agentIds: [agent.id],
          context,
        },
      ],
      ungroupedOrder: [],
    });
    await (await putLayout(b, "gwen", wsId, g("first"))).json();
    const key = await groupFileKey(wsId, agent.id);
    expect(await vfs.readText(key)).toBe("first");

    await (await putLayout(b, "gwen", wsId, g("second"))).json();
    expect(await vfs.readText(key)).toBe("second");
  } finally {
    await close();
  }
});

test("removing an agent from the group deletes its GROUP.md", async () => {
  const { base: b, close } = await startServer({ paths: groupPaths });
  try {
    const wsId = await wsIdOf("gus");
    const agent = await store.createAgent({ workspaceId: wsId, name: "Cy" });
    await (
      await putLayout(b, "gus", wsId, {
        groups: [
          {
            id: "g1",
            name: "Ops",
            collapsed: false,
            agentIds: [agent.id],
            context: "stay concise",
          },
        ],
        ungroupedOrder: [],
      })
    ).json();
    const key = await groupFileKey(wsId, agent.id);
    expect(await vfs.readText(key)).toBe("stay concise");

    await (
      await putLayout(b, "gus", wsId, {
        groups: [
          {
            id: "g1",
            name: "Ops",
            collapsed: false,
            agentIds: [],
            context: "stay concise",
          },
        ],
        ungroupedOrder: [agent.id],
      })
    ).json();
    expect(await vfs.readText(key)).toBeNull();
  } finally {
    await close();
  }
});

test("an agent in no group never gets a GROUP.md", async () => {
  const { base: b, close } = await startServer({ paths: groupPaths });
  try {
    const wsId = await wsIdOf("gia");
    const agent = await store.createAgent({ workspaceId: wsId, name: "Di" });
    await (
      await putLayout(b, "gia", wsId, {
        groups: [
          {
            id: "g1",
            name: "Ops",
            collapsed: false,
            agentIds: [],
            context: "hello",
          },
        ],
        ungroupedOrder: [agent.id],
      })
    ).json();
    expect(await vfs.readText(await groupFileKey(wsId, agent.id))).toBeNull();
  } finally {
    await close();
  }
});

test("the group-context mirror is a no-op (PUT still 200) without a paths dep", async () => {
  const wsId = await wsIdOf("gil");
  const agent = await store.createAgent({ workspaceId: wsId, name: "Ed" });
  // `base` is the shared server built from deps() — no `paths`, so the sync
  // degrades to a no-op while the primary preference write still succeeds.
  const put = await putLayout(base, "gil", wsId, {
    groups: [
      {
        id: "g1",
        name: "Ops",
        collapsed: false,
        agentIds: [agent.id],
        context: "hi",
      },
    ],
    ungroupedOrder: [],
  });
  expect(put.status).toBe(200);
  await put.json();
  expect(await vfs.readText(await groupFileKey(wsId, agent.id))).toBeNull();
});
