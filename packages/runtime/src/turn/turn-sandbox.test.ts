import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsVfs } from "@houston/host/src/vfs";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { expect, test, vi } from "vitest";
import type { TurnFilesystem } from "./turn-filesystem";
import { makeTurnSandboxFetch } from "./turn-sandbox";

async function fixture(fetchImpl: typeof fetch = fetch) {
  const root = await mkdtemp(join(tmpdir(), "turn-sandbox-"));
  const store: ObjectStore = {
    list: async () => [],
    manifest: async () => [],
    download: async () => undefined,
    upload: async () => ({ generation: "1" }),
    delete: async () => undefined,
  };
  const filesystem = {
    kind: "standing" as const,
    storeRoot: root,
    workspaceRel: "workspaces/Personal/Bob",
    workspaceDir: join(root, "workspaces/Personal/Bob"),
    dataRel: "workspaces/Personal/Bob/.houston/runtime",
    dataDir: join(root, "workspaces/Personal/Bob/.houston/runtime"),
    manifest: new Map(),
    vfs: new FsVfs(root),
    listedObjects: 0,
    generationAware: true,
    immediateWrites: new Set(),
  } satisfies TurnFilesystem;
  return makeTurnSandboxFetch({
    grant: {
      url: "https://gateway.test",
      token: "grant-secret",
      expires: 2_000_000_000,
      scopes: ["integrations", "agent-writes"],
    },
    hostToken: "host-secret",
    store,
    prefix: "",
    filesystem,
    workspaceId: "w1",
    conversationId: "c1",
    orgSlug: "org",
    agentSlug: "agent",
    fetchImpl,
  });
}

const post = (
  call: ReturnType<typeof makeTurnSandboxFetch>["call"],
  path: string,
  body: unknown,
) => call(path, { method: "POST", body: JSON.stringify(body) });

test.each([
  ["/sandbox/integrations/search", {}],
  ["/sandbox/integrations/execute", {}],
  ["/sandbox/integrations/custom/detect", {}],
  ["/sandbox/integrations/custom/add", { auth: "oauth" }],
  ["/sandbox/integrations/custom/remove", {}],
  ["/sandbox/integrations/custom/status", {}],
  ["/sandbox/routines/save", {}],
  ["/sandbox/learnings/save", {}],
  ["/sandbox/skills/search", {}],
  ["/sandbox/skills/install", {}],
])("routes %s through the turn facade", async (path, body) => {
  const sandbox = await fixture();
  const response = await post(sandbox.call, path, body);
  expect(response.status).not.toBe(404);
  await sandbox.dispose();
});

test("gateway authorization uses the grant and a 401 becomes grant_expired", async () => {
  const calls: { url: string; authorization: string | null }[] = [];
  const sandbox = await fixture(async (input, init) => {
    calls.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("authorization"),
    });
    return Response.json({ error: "expired" }, { status: 401 });
  });
  const response = await post(sandbox.call, "/sandbox/integrations/search", {
    query: "email",
  });
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({
    error: "turn grant expired",
    code: "grant_expired",
  });
  expect(calls).toEqual([
    {
      url: "https://gateway.test/v1/integrations/composio/search",
      authorization: "Bearer grant-secret",
    },
  ]);
  await sandbox.dispose();
});

test("a gateway 403 body relays verbatim", async () => {
  const sandbox = await fixture(async () =>
    Response.json(
      { error: "blocked", code: "toolkit_not_allowed" },
      { status: 403 },
    ),
  );
  const response = await post(sandbox.call, "/sandbox/integrations/execute", {
    action: "GMAIL_SEND_EMAIL",
    params: {},
  });
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    error: "blocked",
    code: "toolkit_not_allowed",
  });
  await sandbox.dispose();
});

test("tools-prefixed execute stays in the custom executor", async () => {
  const gateway = vi.fn<typeof fetch>();
  const sandbox = await fixture(gateway);
  const response = await post(sandbox.call, "/sandbox/integrations/execute", {
    action: "tools.example.owner.default.doThing",
    params: {},
  });
  expect(response.status).toBe(200);
  expect(gateway).not.toHaveBeenCalled();
  await sandbox.dispose();
});
