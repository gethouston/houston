import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  LocalDirStore,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";
import { afterAll, expect, test } from "vitest";

const scratch = mkdtempSync(join(tmpdir(), "houston-pool-skills-answer-"));
process.env.HOUSTON_MODE = "turn";
process.env.HOUSTON_DATA_DIR = join(scratch, "process-data");
process.env.HOUSTON_WORKSPACE_DIR = join(scratch, "process-workspace");
process.env.HOUSTON_CODE_EXECUTION = "disabled";

const { createTurnServer } = await import("./server");

const storeRoot = join(scratch, "store");
const sharedRoot = join(scratch, "shared");
const servers: Server[] = [];
const systems: string[] = [];

function write(root: string, rel: string, value: string): void {
  const path = join(root, ...rel.split("/"));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function listen(server: Server): Promise<string> {
  servers.push(server);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        return reject(new Error("no port"));
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

const provider = createServer((req, res) => {
  void (async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of req)
      chunks.push(Buffer.from(chunk as Uint8Array));
    systems.push(Buffer.concat(chunks).toString("utf8"));
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "ok" }, finish_reason: "stop" }] })}\n\n`,
    );
    res.end("data: [DONE]\n\n");
  })().catch((error) => {
    res.writeHead(500);
    res.end(error instanceof Error ? error.message : String(error));
  });
});
const providerUrl = await listen(provider);

const prefix = "ws/org-a/agent-1";
write(
  join(storeRoot, prefix),
  "data/custom-endpoint.json",
  JSON.stringify({ baseUrl: `${providerUrl}/v1`, model: "echo" }),
);
write(
  join(storeRoot, prefix),
  "workspace/.houston/skills-manifest/skills-manifest.json",
  JSON.stringify({ version: 1, enabled: ["invoices"] }),
);
write(
  sharedRoot,
  "skills/invoices/SKILL.md",
  "---\nname: invoices\ndescription: ORG-A-INVOICE-RULES\n---\n\nDo it.\n",
);

let release: () => void = () => undefined;
const held = new Promise<void>((resolve) => {
  release = resolve;
});
const shared = new LocalDirStore(sharedRoot);
const slowShared: ObjectStore = {
  list: (p) => shared.list(p),
  manifest: async (p) => {
    await held;
    return shared.manifest(p);
  },
  download: (key, destination, options) =>
    shared.download(key, destination, options),
  upload: (source, key, options) => shared.upload(source, key, options),
  delete: (key, options) => shared.delete(key, options),
};

const runtimeUrl = await listen(
  createTurnServer({
    store: new LocalDirStore(storeRoot),
    token: "",
    concurrency: 1,
    sharedSkillsStore: () => slowShared,
  }),
);

afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

test("the worker answers before the shared skills land; the prompt waits", async () => {
  const response = await fetch(`${runtimeUrl}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId: "org-a",
      agentId: "agent-1",
      conversationId: "c1",
      text: "hello",
      model: "echo",
      gcsPrefix: prefix,
      credential: {
        provider: "openai-compatible",
        access: "token",
        expires: Date.now() + 60_000,
        kind: "api_key",
      },
    }),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(systems).toEqual([]);
  release();
  expect(await response.text()).toContain('"type":"done"');
  expect(systems.join("\n")).toContain("ORG-A-INVOICE-RULES");
});
