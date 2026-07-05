import type { Server } from "node:http";
import type { Capabilities } from "@houston/protocol";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import type { TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";

/**
 * The installed agent-config library over the wire: listing merges-ready
 * entries (manifest + inlined CLAUDE.md) and installing a repo's houston.json
 * from GitHub — the HOU-662 successor of the Rust store remnants.
 */

const verifier: TokenVerifier = {
  async verify(b) {
    return b.startsWith("tok:") ? { userId: b.slice(4) } : null;
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

const vfs = new MemoryVfs();

/** Serve fixture files as raw.githubusercontent.com would (main branch only). */
const repoFiles = new Map<string, string>();
const fetchImpl = (async (input: RequestInfo | URL) => {
  const url = String(input);
  const m = url.match(
    /^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/(main|master)\/(.+)$/,
  );
  const body = m && m[2] === "main" ? repoFiles.get(`${m[1]}/${m[3]}`) : null;
  if (body === undefined || body === null)
    return new Response("not found", { status: 404 });
  return new Response(body, { status: 200 });
}) as typeof fetch;

const deps: ControlPlaneDeps = {
  verifier,
  store: new MemoryWorkspaceStore(),
  credentials: {
    async get() {
      return null;
    },
    async put() {},
    async remove() {},
  },
  vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
  channels: {},
  vfs,
  capabilities: CAPS,
  agentConfigs: { vfs, root: (u) => `users/${u}/agent-configs`, fetchImpl },
};

let server: Server;
let base = "";
const auth = {
  Authorization: "Bearer tok:alice",
  "Content-Type": "application/json",
};

beforeAll(async () => {
  server = createControlPlaneServer(deps);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => server.close());

beforeEach(async () => {
  repoFiles.clear();
  await vfs.deletePrefix("users");
});

test("empty library lists as []", async () => {
  const res = await fetch(`${base}/v1/agent-configs`, { headers: auth });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual([]);
});

test("lists manifests and inlines a sibling CLAUDE.md", async () => {
  const root = "users/alice/agent-configs";
  await vfs.writeText(
    `${root}/researcher/houston.json`,
    JSON.stringify({ id: "researcher", name: "Researcher" }),
  );
  await vfs.writeText(`${root}/researcher/CLAUDE.md`, "# Be thorough");
  // An embedded claudeMd wins over the sibling file.
  await vfs.writeText(
    `${root}/writer/houston.json`,
    JSON.stringify({ id: "writer", name: "Writer", claudeMd: "# Write" }),
  );
  await vfs.writeText(`${root}/writer/CLAUDE.md`, "# ignored");
  // A malformed manifest hides only its own entry.
  await vfs.writeText(`${root}/broken/houston.json`, "{nope");

  const res = await fetch(`${base}/v1/agent-configs`, { headers: auth });
  const list = (await res.json()) as Array<{
    config: Record<string, unknown>;
    path: string;
  }>;
  expect(list.map((e) => e.config.id).sort()).toEqual(["researcher", "writer"]);
  const researcher = list.find((e) => e.config.id === "researcher");
  expect(researcher?.config.claudeMd).toBe("# Be thorough");
  expect(researcher?.path).toBe(`${root}/researcher`);
  const writer = list.find((e) => e.config.id === "writer");
  expect(writer?.config.claudeMd).toBe("# Write");
});

test("libraries are per-user", async () => {
  await vfs.writeText(
    "users/bob/agent-configs/spy/houston.json",
    JSON.stringify({ id: "spy" }),
  );
  const res = await fetch(`${base}/v1/agent-configs`, { headers: auth });
  expect(await res.json()).toEqual([]);
});

test("install from GitHub writes the library entry and lists it back", async () => {
  repoFiles.set(
    "acme/helper/houston.json",
    JSON.stringify({ id: "helper", name: "Helper" }),
  );
  repoFiles.set("acme/helper/CLAUDE.md", "# Help a lot");

  const res = await fetch(`${base}/v1/agents/install-from-github`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ githubUrl: "https://github.com/acme/helper" }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ agentId: "helper" });

  const root = "users/alice/agent-configs/helper";
  expect(await vfs.readText(`${root}/CLAUDE.md`)).toBe("# Help a lot");
  const source = JSON.parse((await vfs.readText(`${root}/.source.json`)) ?? "");
  expect(source.repo).toBe("acme/helper");

  const list = (await (
    await fetch(`${base}/v1/agent-configs`, { headers: auth })
  ).json()) as Array<{ config: Record<string, unknown> }>;
  expect(list).toHaveLength(1);
  expect(list[0]?.config).toMatchObject({
    id: "helper",
    name: "Helper",
    claudeMd: "# Help a lot",
  });
});

test("install rejects garbage input and repos without a manifest", async () => {
  const bad = await fetch(`${base}/v1/agents/install-from-github`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ githubUrl: "not a repo!!" }),
  });
  expect(bad.status).toBe(400);

  const missing = await fetch(`${base}/v1/agents/install-from-github`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ githubUrl: "acme/empty" }),
  });
  expect(missing.status).toBe(404);
  expect(((await missing.json()) as { error: string }).error).toContain(
    "houston.json",
  );

  repoFiles.set("acme/noid/houston.json", JSON.stringify({ name: "NoId" }));
  const noId = await fetch(`${base}/v1/agents/install-from-github`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ githubUrl: "acme/noid" }),
  });
  expect(noId.status).toBe(400);
});

test("unwired library: list is empty, install fails loudly", async () => {
  const bareDeps: ControlPlaneDeps = { ...deps, agentConfigs: undefined };
  const bare = createControlPlaneServer(bareDeps);
  await new Promise<void>((r) => bare.listen(0, "127.0.0.1", () => r()));
  const addr = bare.address();
  const bareBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  try {
    const list = await fetch(`${bareBase}/v1/agent-configs`, {
      headers: auth,
    });
    expect(await list.json()).toEqual([]);
    const install = await fetch(`${bareBase}/v1/agents/install-from-github`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ githubUrl: "acme/helper" }),
    });
    expect(install.status).toBe(503);
  } finally {
    bare.close();
  }
});
