import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterAll, expect, test } from "vitest";

const scratch = mkdtempSync(join(tmpdir(), "houston-pool-leaks-"));
process.env.HOUSTON_MODE = "turn";
process.env.HOUSTON_DATA_DIR = join(scratch, "process-data");
process.env.HOUSTON_WORKSPACE_DIR = join(scratch, "process-workspace");
process.env.HOUSTON_CODE_EXECUTION = "disabled";

const { createTurnServer } = await import("./server");

const storeRoot = join(scratch, "store");
const store = new LocalDirStore(storeRoot);
const servers: Server[] = [];
const seen: Array<{ prompt: string; token: string }> = [];

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

function seed(prefix: string, rel: string, value: string): void {
  const path = join(storeRoot, ...prefix.split("/"), ...rel.split("/"));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function lastPrompt(body: unknown): string {
  const messages = (body as { messages?: Array<{ content?: unknown }> })
    .messages;
  const content = messages?.at(-1)?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part &&
        typeof part === "object" &&
        "text" in part &&
        typeof part.text === "string"
          ? part.text
          : "",
      )
      .join("");
  }
  return "";
}

const provider = createServer((req, res) => {
  void (async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of req)
      chunks.push(Buffer.from(chunk as Uint8Array));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    const token =
      /^Bearer (\S+)$/.exec(req.headers.authorization ?? "")?.[1] ?? "";
    const prompt = lastPrompt(body);
    seen.push({ prompt, token });
    await new Promise((resolve) => setTimeout(resolve, 10));
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: `echo:${prompt}` }, finish_reason: null }] })}\n\n`,
    );
    res.write(
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
    );
    res.end("data: [DONE]\n\n");
  })().catch((error) => {
    res.writeHead(500);
    res.end(error instanceof Error ? error.message : String(error));
  });
});

const providerUrl = await listen(provider);
for (const agent of ["a", "b"]) {
  const prefix = `ws/w1/agent-${agent}`;
  seed(
    prefix,
    "data/custom-endpoint.json",
    JSON.stringify({ baseUrl: `${providerUrl}/v1`, model: "echo" }),
  );
  seed(prefix, "workspace/secret.txt", `SECRET-${agent.toUpperCase()}`);
}
seed(
  "ws/w1/agent-s",
  "workspaces/W/A/.houston/runtime/custom-endpoint.json",
  JSON.stringify({ baseUrl: `${providerUrl}/v1`, model: "echo" }),
);
seed("ws/w1/agent-s", "workspaces/W/A/secret.txt", "SECRET-S");
mkdirSync(process.env.HOUSTON_DATA_DIR, { recursive: true });
writeFileSync(
  join(process.env.HOUSTON_DATA_DIR, "auth.json"),
  JSON.stringify({
    "openai-compatible": { type: "api_key", key: "process-global-token" },
  }),
);

const runtime = createTurnServer({ store, token: "", concurrency: 1 });
const runtimeUrl = await listen(runtime);
async function observeRoot(
  secret: string,
  workspaceRel = "workspace",
): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    for (const name of readdirSync(tmpdir())) {
      if (!name.startsWith("houston-turn-")) continue;
      const root = join(tmpdir(), name);
      try {
        if (
          readFileSync(
            join(root, "store", workspaceRel, "secret.txt"),
            "utf8",
          ) === secret
        ) {
          return root;
        }
      } catch {
        // Another test's root, or this root before hydration completed.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`did not observe the ${secret} turn root`);
}

async function run(
  agent: "a" | "b" | "s",
  index: number,
  workspaceRel?: string,
): Promise<void> {
  const responsePromise = fetch(`${runtimeUrl}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId: "w1",
      agentId: `agent-${agent}`,
      conversationId: "same-cid",
      text: `REQUEST-${agent.toUpperCase()}-${index}`,
      model: "echo",
      gcsPrefix: `ws/w1/agent-${agent}`,
      credential: {
        provider: "openai-compatible",
        access: `token-${agent}`,
        expires: Date.now() + 60_000,
        kind: "api_key",
      },
    }),
  });
  const root = await observeRoot(`SECRET-${agent.toUpperCase()}`, workspaceRel);
  const response = await responsePromise;
  expect(response.status).toBe(200);
  const raw = await response.text();
  expect(raw).toContain(`echo:REQUEST-${agent.toUpperCase()}-${index}`);
  expect(existsSync(root)).toBe(false);
}

afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

test("alternating agents leave no credential, conversation, auth, root, or config-dir leaks", async () => {
  await run("a", 0);
  await run("b", 0);
  await run("a", 1);
  await run("b", 1);
  await run("s", 0, "workspaces/W/A");
  await run("s", 1, "workspaces/W/A");

  expect(seen.map(({ token }) => token)).toEqual([
    "token-a",
    "token-b",
    "token-a",
    "token-b",
    "token-s",
    "token-s",
  ]);
  expect(seen.some(({ token }) => token === "process-global-token")).toBe(
    false,
  );

  const aConversation = readFileSync(
    join(storeRoot, "ws/w1/agent-a/data/conversations/same-cid.json"),
    "utf8",
  );
  const bConversation = readFileSync(
    join(storeRoot, "ws/w1/agent-b/data/conversations/same-cid.json"),
    "utf8",
  );
  expect(aConversation).toContain("REQUEST-A-1");
  expect(aConversation).not.toContain("REQUEST-B");
  expect(bConversation).toContain("REQUEST-B-1");
  expect(bConversation).not.toContain("REQUEST-A");
  const standingConversation = readFileSync(
    join(
      storeRoot,
      "ws/w1/agent-s/workspaces/W/A/.houston/runtime/conversations/same-cid.json",
    ),
    "utf8",
  );
  expect(standingConversation).toContain("REQUEST-S-1");
  expect(standingConversation).not.toContain("REQUEST-A");
  expect(await store.list("ws/w1")).not.toContainEqual(
    expect.stringMatching(/auth\.json$/),
  );
});
