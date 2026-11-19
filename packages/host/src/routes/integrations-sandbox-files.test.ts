import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Capabilities } from "@houston/protocol";
import { afterEach, expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import { EnvCredentialVault } from "../credentials/vault";
import { FakeIntegrationProvider } from "../integrations/fake";
import type { FileUploadRequest } from "../integrations/file-args";
import { IntegrationRegistry } from "../integrations/registry";
import { LocalPaths } from "../paths";
import { createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";

/**
 * The sandbox execute route stages file arguments from the CALLING agent's
 * workspace before the provider runs the action, over real HTTP: the runtime's
 * HMAC proxy in, a real PUT out to the slot the provider minted.
 */

const CAPS: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: ["openai-codex"],
  openaiCompatible: false,
  integrations: ["composio"],
  sharedSkills: false,
};

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  return `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
}

async function setup() {
  const received: Buffer[] = [];
  const storage = await listen(
    createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        received.push(Buffer.concat(chunks));
        res.writeHead(200).end();
      });
    }),
  );
  const reserves: FileUploadRequest[] = [];
  const provider = Object.assign(new FakeIntegrationProvider(), {
    describeAction: async () => ({
      action: "GOOGLEDRIVE_UPLOAD_FILE",
      toolkit: "googledrive",
      inputParams: {
        properties: {
          file_to_upload: { type: "object", file_uploadable: true },
        },
      },
    }),
    reserveFileUpload: async (_u: string, req: FileUploadRequest) => {
      reserves.push(req);
      return {
        key: `k/${req.filename}`,
        uploadUrl: `${storage}/put`,
        headers: { "Content-Type": req.mimetype },
      };
    },
  });
  const store = new MemoryWorkspaceStore({ defaultRuntime: "gke" });
  const vault = new EnvCredentialVault({ secret: "test-secret" });
  const paths = new LocalPaths();
  const root = mkdtempSync(join(tmpdir(), "sandbox-files-"));
  const base = await listen(
    createControlPlaneServer({
      verifier: { verify: async () => null },
      store,
      credentials: new MemoryCredentialStore(),
      vault,
      channels: {},
      capabilities: CAPS,
      integrations: { registry: new IntegrationRegistry([provider]) },
      paths,
      agentDir: (_ws, a) => join(root, ...a.id.split("/")),
      corsOrigin: "*",
    }),
  );
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "CMO" });
  mkdirSync(join(root, ...agent.id.split("/")), { recursive: true });
  writeFileSync(join(root, ...agent.id.split("/"), "q3.pdf"), "%PDF");
  const execute = (params: Record<string, unknown>) =>
    fetch(`${base}/sandbox/integrations/execute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vault.sandboxToken(ws.id, agent.id)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "GOOGLEDRIVE_UPLOAD_FILE", params }),
    });
  return { execute, received, reserves };
}

test("a workspace path is uploaded and executed as the provider's file object", async () => {
  const { execute, received, reserves } = await setup();
  const res = await execute({ file_to_upload: "q3.pdf", name: "Q3" });
  expect(res.status).toBe(200);
  expect((await res.json()).data.params).toEqual({
    file_to_upload: {
      name: "q3.pdf",
      mimetype: "application/pdf",
      s3key: "k/q3.pdf",
    },
    name: "Q3",
  });
  expect(reserves.map((r) => r.filename)).toEqual(["q3.pdf"]);
  expect(received).toEqual([Buffer.from("%PDF")]);
});

test("a missing file answers as the action's failure, phrased for the model", async () => {
  const { execute, received } = await setup();
  const res = await execute({ file_to_upload: "nope.pdf" });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.successful).toBe(false);
  expect(body.error).toMatch(/"nope.pdf" was not found in your workspace/);
  expect(received).toEqual([]);
});
