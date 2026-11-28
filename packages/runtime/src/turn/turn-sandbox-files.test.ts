import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsVfs } from "@houston/host/src/vfs";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import type { TurnFilesystem } from "./turn-filesystem";
import { makeTurnSandboxFetch } from "./turn-sandbox";

/**
 * Pooled turns (every cloud agent) run integrations through the turn facade,
 * not the host: a workspace file the agent names is uploaded from the turn's
 * own tree and executed as Composio's file object.
 */

interface Seen {
  method: string;
  path: string;
  body: unknown;
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "turn-files-"));
  const workspaceDir = join(root, "workspaces/Personal/Bob");
  await mkdir(join(workspaceDir, "reports"), { recursive: true });
  await writeFile(join(workspaceDir, "reports", "q3.pdf"), "%PDF");
  const seen: Seen[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body =
      method === "PUT"
        ? Buffer.from(init?.body as Uint8Array).toString()
        : init?.body
          ? JSON.parse(String(init.body))
          : undefined;
    seen.push({ method, path: url.pathname, body });
    if (url.pathname.endsWith("/actions/GOOGLEDRIVE_UPLOAD_FILE")) {
      return Response.json({
        action: "GOOGLEDRIVE_UPLOAD_FILE",
        toolkit: "googledrive",
        inputParams: {
          properties: {
            file_to_upload: { type: "object", file_uploadable: true },
          },
        },
      });
    }
    if (url.pathname.endsWith("/files/upload-request")) {
      return Response.json({
        key: "k/q3.pdf",
        uploadUrl: "https://storage.test/put",
        headers: { "Content-Type": "application/pdf" },
      });
    }
    if (method === "PUT") return new Response(null, { status: 200 });
    const sent = body as { params?: unknown };
    return Response.json({ successful: true, data: sent.params });
  }) as typeof fetch;
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
    workspaceDir,
    dataRel: "workspaces/Personal/Bob/.houston/runtime",
    dataDir: join(workspaceDir, ".houston/runtime"),
    manifest: new Map(),
    vfs: new FsVfs(root),
    listedObjects: 0,
    skippedObjects: 0,
    startupLoad: { objects: 0, bytes: 0 },
    generationAware: true,
    immediateWrites: new Set(),
  } satisfies TurnFilesystem;
  const sandbox = makeTurnSandboxFetch({
    grant: {
      url: "https://gateway.test",
      token: "grant-secret",
      expires: 2_000_000_000,
      scopes: ["integrations"],
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
  const execute = (params: Record<string, unknown>) =>
    sandbox.call("/sandbox/integrations/execute", {
      method: "POST",
      body: JSON.stringify({ action: "GOOGLEDRIVE_UPLOAD_FILE", params }),
    });
  return { sandbox, execute, seen, workspaceDir };
}

test("a workspace file is uploaded from the turn tree before execute", async () => {
  const { sandbox, execute, seen, workspaceDir } = await fixture();
  const res = await execute({
    file_to_upload: `${workspaceDir}/reports/q3.pdf`,
  });
  expect(res.status).toBe(200);
  expect((await res.json()).data).toEqual({
    file_to_upload: {
      name: "q3.pdf",
      mimetype: "application/pdf",
      s3key: "k/q3.pdf",
    },
  });
  expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
    "GET /v1/integrations/composio/actions/GOOGLEDRIVE_UPLOAD_FILE",
    "POST /v1/integrations/composio/files/upload-request",
    "PUT /put",
    "POST /v1/integrations/composio/execute",
  ]);
  expect(seen[2]?.body).toBe("%PDF");
  await sandbox.dispose();
});

test("a missing file answers as the action's failure and executes nothing", async () => {
  const { sandbox, execute, seen } = await fixture();
  const res = await execute({ file_to_upload: "reports/q4.pdf" });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.successful).toBe(false);
  expect(body.error).toMatch(/was not found in your workspace/);
  expect(seen.some((s) => s.path.endsWith("/execute"))).toBe(false);
  await sandbox.dispose();
});
