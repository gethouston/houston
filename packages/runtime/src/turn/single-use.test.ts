import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test, vi } from "vitest";
import { createTurnServer } from "./server";
import { markWorkerSpent, workerSpent } from "./single-use";
import type { runPiTurn } from "./turn-session";

const servers: Server[] = [];
const homes: string[] = [];
afterEach(() => {
  servers.splice(0).forEach((server) => {
    server.close();
  });
  if (homes.length > 0) {
    const previous = homes.splice(0)[0];
    if (previous === undefined) delete process.env.HOUSTON_HOME;
    else process.env.HOUSTON_HOME = previous;
  }
});

async function isolatedHome(): Promise<void> {
  homes.push(process.env.HOUSTON_HOME as string);
  process.env.HOUSTON_HOME = await mkdtemp(join(tmpdir(), "single-use-home-"));
}

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  return `http://127.0.0.1:${address.port}`;
}

const claimed = {
  workspaceId: "w1",
  agentId: "agent-1",
  conversationId: "c1",
  text: "hello",
  gcsPrefix: "ws/w1/agent-1",
  credential: {
    provider: "openai-codex",
    access: "access-token",
    expires: Date.now() + 60_000,
  },
  hostToken: "host-token",
  claim: {
    id: "claim-1",
    bootId: "boot-1",
    token: "claim-token",
    heartbeatUrl: "https://gateway.test/v1/pool/claims/heartbeat",
  },
};

async function seededStore(): Promise<LocalDirStore> {
  const storeRoot = await mkdtemp(join(tmpdir(), "single-use-store-"));
  const conversation = join(
    storeRoot,
    "ws/w1/agent-1/workspaces/W/A/.houston/runtime/conversations/c1.json",
  );
  await mkdir(dirname(conversation), { recursive: true });
  await writeFile(conversation, "{}");
  return new LocalDirStore(storeRoot);
}

test("the spent marker latches under HOUSTON_HOME and survives re-checks", async () => {
  await isolatedHome();
  expect(workerSpent()).toBe(false);
  await markWorkerSpent();
  expect(workerSpent()).toBe(true);
});

test("a claimed turn spends the worker: begin before the turn, settled after", async () => {
  await isolatedHome();
  const order: string[] = [];
  const runTurn: typeof runPiTurn = async () => {
    order.push("turn");
    return {};
  };
  const base = await listen(
    createTurnServer({
      store: await seededStore(),
      token: "",
      runTurn,
      fetchImpl: async () => new Response(null, { status: 204 }),
      singleUse: {
        begin: async () => {
          order.push("begin");
          await markWorkerSpent();
        },
        settled: () => order.push("settled"),
      },
    }),
  );
  const response = await fetch(`${base}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(claimed),
  });
  await response.text();
  expect(response.status).toBe(200);
  expect(order).toEqual(["begin", "turn", "settled"]);
  expect(workerSpent()).toBe(true);
});

test("an unclaimed turn does not spend the worker", async () => {
  await isolatedHome();
  const begin = vi.fn(async () => undefined);
  const settled = vi.fn();
  const runTurn: typeof runPiTurn = async () => ({});
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(await mkdtemp(join(tmpdir(), "single-use-"))),
      token: "",
      runTurn,
      singleUse: { begin, settled },
    }),
  );
  const { claim: _claim, hostToken: _hostToken, ...unclaimed } = claimed;
  const response = await fetch(`${base}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(unclaimed),
  });
  await response.text();
  expect(begin).not.toHaveBeenCalled();
  expect(settled).not.toHaveBeenCalled();
  expect(workerSpent()).toBe(false);
});

test("a spent worker refuses further turns via the draining gate", async () => {
  await isolatedHome();
  await markWorkerSpent();
  const runTurn: typeof runPiTurn = async () => ({});
  const base = await listen(
    createTurnServer({
      store: await seededStore(),
      token: "",
      runTurn,
      isDraining: () => workerSpent(),
    }),
  );
  const response = await fetch(`${base}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(claimed),
  });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "worker_draining" });
});
