import { mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test } from "vitest";
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
const PREFIX = "ws/acme/ledger";

async function postSeed(op: Record<string, unknown>) {
  const storeRoot = mkdtempSync(join(tmpdir(), "op-seed-server-"));
  const store = new LocalDirStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const heartbeat = await listen(
    createServer((_req, res) => {
      res.writeHead(200);
      res.end("{}");
    }),
  );
  const response = await fetch(`${base}/op`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: "acme",
      agentId: "ledger",
      gcsPrefix: PREFIX,
      hostToken: "host-token",
      claim: {
        id: "claim-1",
        bootId: "boot-1",
        token: "claim-token",
        heartbeatUrl: heartbeat,
      },
      triggersEnabled: false,
      op: { kind: "seed", ...op },
    }),
  });
  return {
    status: response.status,
    json: (await response.json()) as Record<string, unknown>,
    keys: await store.list(PREFIX),
  };
}

test("a seed op on an empty prefix creates the agent and answers its id", async () => {
  const { status, json, keys } = await postSeed({
    name: "Ledger",
    claudeMd: "# Ledger\n",
  });
  expect(status).toBe(200);
  expect(json.status, JSON.stringify(json)).toBe(201);
  expect(JSON.parse(json.body as string)).toEqual({
    id: "Personal/Ledger",
    adopted: false,
  });
  expect(keys).toContain(`${PREFIX}/workspaces/Personal/Ledger/CLAUDE.md`);
});

test("a seed op with an invalid name answers 400 with the domain's message", async () => {
  const { status, json, keys } = await postSeed({ name: "../Ledger" });
  expect(status).toBe(400);
  expect(json.error).toBe(
    "agent name must not contain slashes, control characters, '..', or a leading dot",
  );
  expect(keys).toEqual([]);
});
