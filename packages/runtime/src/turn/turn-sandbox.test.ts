import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsVfs } from "@houston/host/src/vfs";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { expect, test, vi } from "vitest";
import type { TurnFilesystem } from "./turn-filesystem";
import { makeTurnSandboxFetch } from "./turn-sandbox";
import type { TurnGrantScope } from "./types";

async function fixture(
  fetchImpl: typeof fetch = fetch,
  scopes: TurnGrantScope[] = ["integrations", "agent-writes"],
) {
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
    skippedObjects: 0,
    generationAware: true,
    immediateWrites: new Set(),
  } satisfies TurnFilesystem;
  const sandbox = makeTurnSandboxFetch({
    grant: {
      url: "https://gateway.test",
      token: "grant-secret",
      expires: 2_000_000_000,
      scopes,
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
  return { ...sandbox, root };
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
])("routes %s through the turn facade", async (path, body) => {
  const sandbox = await fixture();
  const response = await post(sandbox.call, path, body);
  expect(response.status).not.toBe(404);
  await sandbox.dispose();
});

test("gateway authorization uses the grant and a 401 becomes grant_expired", async () => {
  const warning = vi.spyOn(console, "error").mockImplementation(() => {});
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
  expect(warning).toHaveBeenCalledWith(
    expect.stringContaining("before its advertised expiry"),
  );
  warning.mockRestore();
  await sandbox.dispose();
});

test("aborting a tool call aborts its pending gateway request", async () => {
  const sandbox = await fixture(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) reject(signal.reason);
        else signal?.addEventListener("abort", () => reject(signal.reason));
      }),
  );
  const controller = new AbortController();
  const pending = sandbox.call("/sandbox/integrations/search", {
    method: "POST",
    body: JSON.stringify({ query: "email" }),
    signal: controller.signal,
  });
  controller.abort(new Error("tool call cancelled"));

  await expect(pending).rejects.toThrow("tool call cancelled");
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

test("OAuth start is not exposed by the pooled facade", async () => {
  const sandbox = await fixture();
  const response = await post(
    sandbox.call,
    "/sandbox/integrations/custom/oauth/start",
    {},
  );
  expect(response.status).toBe(404);
  await sandbox.dispose();
});

test("custom definition writes capture the updated asleep-read view", async () => {
  const sandbox = await fixture();
  await writeFile(
    join(sandbox.root, "custom-integrations.json"),
    JSON.stringify({
      version: 1,
      items: [
        {
          kind: "mcp",
          slug: "example",
          name: "Example",
          endpoint: "https://mcp.example.test",
          auth: "credential",
          addedAtMs: 1,
        },
      ],
    }),
  );
  const response = await post(
    sandbox.call,
    "/sandbox/integrations/custom/remove",
    { slug: "example" },
  );
  expect(response.status).toBe(200);
  expect(sandbox.views().customDefinitions).toEqual({ items: [] });
  await sandbox.dispose();
});

// --- The code-run relay -------------------------------------------------------

const CODE_RUN = "/sandbox/code/run";
const RUN_REQUEST = { language: "python", code: "print(1)", files: [] };

test("without the code-run scope the relay is simply not a route", async () => {
  const gateway = vi.fn<typeof fetch>();
  const sandbox = await fixture(gateway, ["integrations"]);
  const response = await post(sandbox.call, CODE_RUN, RUN_REQUEST);
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "unknown sandbox route" });
  expect(gateway).not.toHaveBeenCalled();
  await sandbox.dispose();
});

test("code-run forwards the body verbatim under the grant and relays the result", async () => {
  const calls: { url: string; authorization: string | null; body: string }[] =
    [];
  const result = {
    exitCode: 0,
    stdout: "1\n",
    stderr: "",
    timedOut: false,
    truncated: false,
    artifacts: [],
    droppedArtifacts: [],
    durationMs: 3,
  };
  const sandbox = await fixture(
    async (input, init) => {
      calls.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
        body: String(init?.body),
      });
      return Response.json(result);
    },
    ["code-run"],
  );
  const response = await post(sandbox.call, CODE_RUN, RUN_REQUEST);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(result);
  expect(calls).toEqual([
    {
      url: "https://gateway.test/v1/code/run",
      authorization: "Bearer grant-secret",
      body: JSON.stringify(RUN_REQUEST),
    },
  ]);
  await sandbox.dispose();
});

test.each([
  [503, { error: "no sandbox", code: "not_configured" }],
  [413, { error: "too big", code: "body_too_large" }],
  [502, { error: "upstream", code: "sandbox_unavailable" }],
  [400, { error: "unsupported language: cobol" }],
])("a %s from the gateway relays status and body as-is", async (status, body) => {
  const sandbox = await fixture(
    async () => Response.json(body, { status }),
    ["code-run"],
  );
  const response = await post(sandbox.call, CODE_RUN, RUN_REQUEST);
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual(body);
  await sandbox.dispose();
});

test("a 401 on the relay becomes grant_expired, like the integration routes", async () => {
  const warning = vi.spyOn(console, "error").mockImplementation(() => {});
  const sandbox = await fixture(
    async () =>
      Response.json(
        { error: "nope", code: "unauthenticated" },
        { status: 401 },
      ),
    ["code-run"],
  );
  const response = await post(sandbox.call, CODE_RUN, RUN_REQUEST);
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({
    error: "turn grant expired",
    code: "grant_expired",
  });
  warning.mockRestore();
  await sandbox.dispose();
});

test("a cancelled tool call aborts the pending code run", async () => {
  const sandbox = await fixture(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) reject(signal.reason);
        else signal?.addEventListener("abort", () => reject(signal.reason));
      }),
    ["code-run"],
  );
  const controller = new AbortController();
  const pending = sandbox.call(CODE_RUN, {
    method: "POST",
    body: JSON.stringify(RUN_REQUEST),
    signal: controller.signal,
  });
  controller.abort(new Error("tool call cancelled"));
  await expect(pending).rejects.toThrow("tool call cancelled");
  await sandbox.dispose();
});
