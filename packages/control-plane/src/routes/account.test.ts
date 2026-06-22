import { test, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "node:http";
import type { Capabilities, Workspace } from "@houston/protocol";
import { createControlPlaneServer, type ControlPlaneDeps } from "../server";
import { ProxyChannel } from "../channel/proxy";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryCredentialStore } from "../credentials/store";
import { MemoryVfs } from "../vfs";
import type { RuntimeEndpoint, RuntimeLauncher, TokenVerifier } from "../ports";

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
  expect(typeof list[0]!.createdAt).toBe("string");
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
  expect(ws[0]!.locale).toBe("es");
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
  const aliceWs = (
    (await (
      await fetch(`${base}/v1/workspaces`, { headers: auth("alice") })
    ).json()) as Workspace[]
  )[0]!;

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
