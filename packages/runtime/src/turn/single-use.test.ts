import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test, vi } from "vitest";
import { createTurnServer } from "./server";
import {
  assertSingleUseIncarnationConfigured,
  markWorkerSpent,
  workerSpent,
} from "./single-use";
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
  homes.push(process.env.HOUSTON_HOME as string | undefined as string);
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

test("a single-use worker REJECTS an unclaimed real turn (no reusable bash)", async () => {
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
  // An unclaimed real turn would run bash (config-keyed) without spending the
  // pod — serially reusable cross-tenant bash. The worker refuses it outright.
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "single_use_requires_claim" });
  expect(begin).not.toHaveBeenCalled();
  expect(settled).not.toHaveBeenCalled();
  expect(workerSpent()).toBe(false);
});

test("a single-use worker binds the turn to its own pod UID (X-Pool-Pod-UID)", async () => {
  await isolatedHome();
  const begin = vi.fn(async () => {
    await markWorkerSpent();
  });
  const settled = vi.fn();
  const runTurn: typeof runPiTurn = async () => ({});
  const base = await listen(
    createTurnServer({
      store: await seededStore(),
      token: "",
      runTurn,
      podUid: "pod-A",
      singleUse: { begin, settled },
    }),
  );
  const post = (headers: Record<string, string>) =>
    fetch(`${base}/turn`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(claimed),
    });

  // A turn the gateway minted for a DIFFERENT incarnation (this IP was reused by
  // a replacement pod): refused, and the worker is NOT spent.
  const mismatch = await post({ "x-pool-pod-uid": "pod-B" });
  expect(mismatch.status).toBe(409);
  expect(await mismatch.json()).toEqual({ error: "pod_uid_mismatch" });
  // A single-use worker fails closed: a missing binding is refused too.
  const absent = await post({});
  expect(absent.status).toBe(409);
  expect(begin).not.toHaveBeenCalled();
  expect(workerSpent()).toBe(false);

  // The turn minted for THIS incarnation is served normally.
  const ok = await post({ "x-pool-pod-uid": "pod-A" });
  await ok.text();
  expect(ok.status).toBe(200);
  expect(begin).toHaveBeenCalledOnce();
  expect(workerSpent()).toBe(true);
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

test("concurrency-1: a second claimed turn cannot straddle the first's release", async () => {
  await isolatedHome();
  let releaseFirst!: () => void;
  const firstRunning = new Promise<void>((r) => {
    releaseFirst = r;
  });
  let firstStarted!: () => void;
  const firstEntered = new Promise<void>((r) => {
    firstStarted = r;
  });
  let calls = 0;
  const runTurn: typeof runPiTurn = async () => {
    calls += 1;
    firstStarted();
    await firstRunning;
    return {};
  };
  let spent = false;
  const base = await listen(
    createTurnServer({
      store: await seededStore(),
      token: "",
      runTurn,
      concurrency: 1,
      isDraining: () => spent,
      singleUse: {
        begin: async () => {
          spent = true;
          markWorkerSpent();
        },
        settled: () => undefined,
      },
    }),
  );
  const post = () =>
    fetch(`${base}/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(claimed),
    });
  const first = post();
  await firstEntered; // first holds the only admission slot and has spent the pod
  const second = await post();
  // The slot is held for the whole first turn, so the second is refused; even
  // after the first releases, the pod is spent (isDraining) so it never runs.
  expect(second.status).toBe(503);
  releaseFirst();
  expect((await first).status).toBe(200);
  expect(calls).toBe(1);
});

test("markWorkerSpent requires HOUSTON_HOME", () => {
  const prev = process.env.HOUSTON_HOME;
  delete process.env.HOUSTON_HOME;
  try {
    expect(() => markWorkerSpent()).toThrow(/HOUSTON_HOME/);
  } finally {
    if (prev !== undefined) process.env.HOUSTON_HOME = prev;
  }
});

test("a single-use worker refuses to boot without its pod UID (incarnation fence)", () => {
  // The dispatch fence fails open on an empty podUid (incarnationOK returns
  // true). A single-use worker missing HOUSTON_POD_UID would accept a turn
  // dispatched for a prior incarnation of its ordinal — so boot must throw.
  expect(() => assertSingleUseIncarnationConfigured(true, "")).toThrow(
    /HOUSTON_POD_UID/,
  );
  expect(() => assertSingleUseIncarnationConfigured(true, "   ")).toThrow(
    /HOUSTON_POD_UID/,
  );
  // A configured single-use worker and any non-single-use worker boot fine.
  expect(() =>
    assertSingleUseIncarnationConfigured(true, "pod-uid-abc"),
  ).not.toThrow();
  expect(() => assertSingleUseIncarnationConfigured(false, "")).not.toThrow();
});
