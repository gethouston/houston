import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unpackAgent } from "@houston/domain";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test } from "vitest";
import { parseOpRequest } from "./parse-op-request";
import { createTurnServer } from "./server";
import type { TurnRunner } from "./turn-session";

const servers: Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const noopTurn: TurnRunner = async () => ({});
const PREFIX = "ws/acme/sales";

async function workerWithAgent() {
  const storeRoot = mkdtempSync(join(tmpdir(), "op-agent-name-"));
  const agentDir = join(storeRoot, PREFIX, "workspaces", "Personal", "Sales");
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "CLAUDE.md"), "# Sales\n");
  writeFileSync(join(agentDir, "report.md"), "# Q1\n");
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn: noopTurn,
    }),
  );
  const heartbeat = await listen(
    createServer((_req, res) => {
      res.writeHead(200);
      res.end("{}");
    }),
  );
  return async (op: unknown, agentName?: unknown) => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`${base}/op`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "acme",
          agentId: "sales",
          ...(agentName !== undefined ? { agentName } : {}),
          gcsPrefix: PREFIX,
          hostToken: "host-token",
          claim: {
            id: "claim-1",
            bootId: "boot-1",
            token: "claim-token",
            heartbeatUrl: heartbeat,
          },
          triggersEnabled: false,
          op,
        }),
      });
      const json = (await response.json()) as {
        status: number;
        error?: string;
        bodyBase64?: string;
        headers?: Record<string, string>;
      };
      if (json.error !== "worker_full" || attempt > 40) return json;
      await new Promise((r) => setTimeout(r, 25));
    }
  };
}

const EXPORT = {
  kind: "route",
  method: "POST",
  rest: "portable/export",
  contentType: "application/json",
  body: JSON.stringify({ claudeMd: true }),
};
const ARCHIVE = { kind: "route", method: "GET", rest: "files/archive" };

const exportedName = (bodyBase64 = "") =>
  unpackAgent(new Uint8Array(Buffer.from(bodyBase64, "base64"))).manifest
    .agentName;

test("an op's export and files zip carry the gateway's name, not the folder's", async () => {
  const post = await workerWithAgent();
  const exported = await post(EXPORT, "Closer");
  expect(exported.status).toBe(200);
  expect(exportedName(exported.bodyBase64)).toBe("Closer");
  expect(exported.headers?.["content-disposition"]).toContain(
    "Closer.houstonagent",
  );
  const archive = await post(ARCHIVE, "Closer");
  expect(archive.status).toBe(200);
  expect(archive.headers?.["content-disposition"]).toContain(
    "Closer files.zip",
  );
});

test("an absent or invalid agentName leaves the folder's name and never fails the op", async () => {
  const post = await workerWithAgent();
  for (const agentName of [undefined, "", "a/b", 7]) {
    const exported = await post(EXPORT, agentName);
    expect(exported.status, String(agentName)).toBe(200);
    expect(exportedName(exported.bodyBase64), String(agentName)).toBe("Sales");
  }
});

test("the envelope keeps only a valid agentName, trimmed", () => {
  const envelope = (agentName: unknown) => ({
    workspaceId: "acme",
    agentId: "sales",
    agentName,
    gcsPrefix: PREFIX,
    hostToken: "ht",
    claim: { id: "c", bootId: "b", token: "t", heartbeatUrl: "http://x/hb" },
    op: { kind: "title", text: "hi" },
  });
  expect(parseOpRequest(envelope(" Closer ")).agentName).toBe("Closer");
  expect(parseOpRequest(envelope("..")).agentName).toBeUndefined();
  expect(parseOpRequest(envelope(null)).agentName).toBeUndefined();
});
