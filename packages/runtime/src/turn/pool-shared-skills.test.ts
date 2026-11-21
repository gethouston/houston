import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterAll, expect, test } from "vitest";

const scratch = mkdtempSync(join(tmpdir(), "houston-pool-shared-skills-"));
process.env.HOUSTON_MODE = "turn";
process.env.HOUSTON_DATA_DIR = join(scratch, "process-data");
process.env.HOUSTON_WORKSPACE_DIR = join(scratch, "process-workspace");
process.env.HOUSTON_CODE_EXECUTION = "disabled";

const { createTurnServer } = await import("./server");
const { poolIdentity } = await import("./turn-store");

const storeRoot = join(scratch, "store");
const sharedRoot = join(scratch, "shared");
const servers: Server[] = [];
const prompts: Array<{ text: string; system: string }> = [];

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

type Message = { role?: string; content?: unknown };
const textOf = (message: Message | undefined): string =>
  typeof message?.content === "string"
    ? message.content
    : Array.isArray(message?.content)
      ? message.content
          .map((part: { text?: unknown }) =>
            typeof part?.text === "string" ? part.text : "",
          )
          .join("")
      : "";

const provider = createServer((req, res) => {
  void (async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of req)
      chunks.push(Buffer.from(chunk as Uint8Array));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      messages?: Message[];
    };
    const messages = body.messages ?? [];
    prompts.push({
      text: textOf(messages.at(-1)),
      system: messages
        .filter((m) => m.role === "system" || m.role === "developer")
        .map(textOf)
        .join("\n"),
    });
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "ok" }, finish_reason: null }] })}\n\n`,
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
const skill = (name: string, description: string) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\nDo the thing.\n`;

for (const org of ["org-a", "org-b"]) {
  const prefix = `ws/${org}/agent-1`;
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
  const upper = org.toUpperCase();
  write(
    join(sharedRoot, org),
    "skills/invoices/SKILL.md",
    skill("invoices", `${upper}-INVOICE-RULES`),
  );
  write(
    join(sharedRoot, org),
    "skills/payroll/SKILL.md",
    skill("payroll", `${upper}-PAYROLL-NOT-ENABLED`),
  );
}

const runtime = createTurnServer({
  store: new LocalDirStore(storeRoot),
  token: "",
  concurrency: 1,
  sharedSkillsStore: (turn) =>
    new LocalDirStore(join(sharedRoot, poolIdentity(turn.gcsPrefix).org)),
});
const runtimeUrl = await listen(runtime);

async function run(org: "org-a" | "org-b", text: string): Promise<void> {
  const response = await fetch(`${runtimeUrl}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId: org,
      agentId: "agent-1",
      conversationId: "c1",
      text,
      model: "echo",
      gcsPrefix: `ws/${org}/agent-1`,
      credential: {
        provider: "openai-compatible",
        access: "token",
        expires: Date.now() + 60_000,
        kind: "api_key",
      },
    }),
  });
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('"type":"done"');
}

afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

test("each org's turn sees only its own org's enabled shared skills", async () => {
  await run("org-a", "TURN-A-1");
  await run("org-b", "TURN-B-1");
  await run("org-a", "TURN-A-2");

  const systemFor = (text: string) =>
    prompts.find((prompt) => prompt.text.includes(text))?.system ?? "";
  for (const turn of ["TURN-A-1", "TURN-A-2"]) {
    expect(systemFor(turn)).toContain("ORG-A-INVOICE-RULES");
    expect(systemFor(turn)).not.toContain("ORG-B");
    expect(systemFor(turn)).not.toContain("PAYROLL");
  }
  expect(systemFor("TURN-B-1")).toContain("ORG-B-INVOICE-RULES");
  expect(systemFor("TURN-B-1")).not.toContain("ORG-A");
});
