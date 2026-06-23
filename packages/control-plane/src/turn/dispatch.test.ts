import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { MemoryCredentialStore } from "../credentials/store";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspaceCredential } from "../ports";
import { MemoryVfs } from "../vfs";
import { ConnectManager } from "./connect";
import type { TurnDeps } from "./deps";
import { dispatchCloudrun } from "./dispatch";
import { TurnQuota } from "./quota";
import { TurnRelay } from "./relay";

/**
 * End-to-end cloudrun dispatch against a FAKE turn runtime speaking the real
 * SSE contract: a turn POST claims quota + relay, carries the refreshed
 * access credential (never the refresh token), pumps frames to a subscriber,
 * and the read endpoints serve straight from object storage.
 */

const ws: Workspace = {
  id: "w1",
  ownerUserId: "alice",
  kind: "personal",
  name: "Personal",
  slug: "alice",
  runtime: "cloudrun",
  createdAt: 1,
};
const agent: Agent = {
  id: "agent-1",
  workspaceId: "w1",
  name: "Sales",
  createdAt: 1,
};

// Fake turn runtime: records the request body, streams user→text→done.
let turnBodies: Record<string, unknown>[] = [];
let fakeRuntime: Server;
let runtimeUrl = "";

beforeAll(async () => {
  fakeRuntime = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      turnBodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(": connected\n\n");
      res.write(
        `data: ${JSON.stringify({ type: "user", data: { content: "hi", ts: 1 } })}\n\n`,
      );
      res.write(
        `data: ${JSON.stringify({ type: "text", data: "built your deck" })}\n\n`,
      );
      res.write(`data: ${JSON.stringify({ type: "done", data: null })}\n\n`);
      res.end();
    });
  });
  await new Promise<void>((r) => fakeRuntime.listen(0, "127.0.0.1", () => r()));
  runtimeUrl = `http://127.0.0.1:${(fakeRuntime.address() as AddressInfo).port}`;
});

afterAll(() => fakeRuntime.close());

function makeDeps(): {
  deps: TurnDeps;
  objects: MemoryVfs;
  credentials: MemoryCredentialStore;
} {
  const objects = new MemoryVfs();
  const credentials = new MemoryCredentialStore();
  const deps: TurnDeps = {
    runtimeUrl,
    turnToken: "turn-secret",
    relay: new TurnRelay(),
    quota: new TurnQuota({ maxConcurrent: 2, perHour: 100 }),
    vfs: objects,
    credentials,
    connect: new ConnectManager(credentials),
    refresh: async (cred: WorkspaceCredential) => ({
      ...cred,
      accessToken: "AT-refreshed",
      expiresAt: Date.now() + 3_600_000,
    }),
    idToken: async () => "google-id-token",
    codexModels: ["gpt-5.5"],
  };
  return { deps, objects, credentials };
}

/** Drive dispatchCloudrun through a real HTTP server (it needs req/res). */
function serve(deps: TurnDeps): Promise<{ base: string; close: () => void }> {
  const s = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://x");
    const rest = url.pathname.replace(/^\//, "");
    void dispatchCloudrun(
      deps,
      ws,
      agent,
      req.method || "GET",
      rest,
      req,
      res,
    ).catch((err) => {
      res.writeHead(500);
      res.end(String(err));
    });
  });
  return new Promise((resolve) =>
    s.listen(0, "127.0.0.1", () =>
      resolve({
        base: `http://127.0.0.1:${(s.address() as AddressInfo).port}`,
        close: () => s.close(),
      }),
    ),
  );
}

test("a turn: refreshes the expiring credential, sends access-only, pumps frames to a subscriber", async () => {
  const { deps, credentials } = makeDeps();
  await credentials.put({
    workspaceId: "w1",
    provider: "openai-codex",
    accessToken: "AT-stale",
    refreshToken: "RT-central",
    accountId: "acct-9",
    expiresAt: Date.now() - 1000, // expiring → must refresh first
  });
  turnBodies = [];
  const { base, close } = await serve(deps);
  try {
    const events: unknown[] = [];
    const done = new Promise<void>((r) => {
      deps.relay.subscribe("agent-1/c1", (e) => {
        events.push(e);
        if (e.type === "done" || e.type === "error") r();
      });
    });
    const res = await fetch(`${base}/conversations/c1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "build me a deck", nonce: "n-1" }),
    });
    expect(res.status).toBe(202);
    await done;

    expect(events.map((e) => (e as { type: string }).type)).toEqual([
      "user",
      "text",
      "done",
    ]);
    const sent = turnBodies[0];
    if (sent === undefined) throw new Error("expected turnBodies[0] to exist");
    expect(sent.gcsPrefix).toBe("ws/w1/agent-1");
    expect(sent.nonce).toBe("n-1");
    const cred = sent.credential as Record<string, unknown>;
    expect(cred.access).toBe("AT-refreshed"); // refreshed centrally before the turn
    expect(cred.accountId).toBe("acct-9");
    expect("refresh" in cred).toBe(false); // the refresh token NEVER rides a turn
    expect(JSON.stringify(sent)).not.toContain("RT-central");
    // The refreshed credential was persisted back centrally.
    expect((await credentials.get("w1", "openai-codex"))?.accessToken).toBe(
      "AT-refreshed",
    );
  } finally {
    close();
  }
});

test("conversation list + history read straight from object storage", async () => {
  const { deps, objects } = makeDeps();
  await objects.writeText(
    "ws/w1/agent-1/data/conversations/c1.json",
    JSON.stringify({
      id: "c1",
      title: "Deck work",
      createdAt: 1,
      updatedAt: 5,
      messages: [{ role: "user", content: "build me a deck", ts: 1 }],
    }),
  );
  const { base, close } = await serve(deps);
  try {
    const list = (await (await fetch(`${base}/conversations`)).json()) as {
      id: string;
    }[];
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("c1");
    const history = (await (
      await fetch(`${base}/conversations/c1/messages`)
    ).json()) as { title: string; messages: unknown[] };
    expect(history.title).toBe("Deck work");
    expect(history.messages).toHaveLength(1);
    expect((await fetch(`${base}/conversations/nope/messages`)).status).toBe(
      404,
    );
  } finally {
    close();
  }
});

test("providers + auth/status reflect the central credential; settings persist to object storage", async () => {
  const { deps, objects, credentials } = makeDeps();
  const { base, close } = await serve(deps);
  try {
    let providers = (await (await fetch(`${base}/providers`)).json()) as {
      configured: boolean;
    }[];
    expect(providers[0]?.configured).toBe(false);

    await credentials.put({
      workspaceId: "w1",
      provider: "openai-codex",
      accessToken: "AT",
      refreshToken: "RT",
      expiresAt: Date.now() + 3_600_000,
    });
    providers = (await (await fetch(`${base}/providers`)).json()) as {
      configured: boolean;
    }[];
    expect(providers[0]?.configured).toBe(true);

    const status = (await (await fetch(`${base}/auth/status`)).json()) as {
      activeProvider: string;
    };
    expect(status.activeProvider).toBe("openai-codex");

    const put = await fetch(`${base}/settings`, {
      method: "PUT",
      body: JSON.stringify({ model: "gpt-5.5" }),
    });
    expect(put.status).toBe(200);
    expect(
      await objects.readText("ws/w1/agent-1/data/settings.json"),
    ).toContain("gpt-5.5");
  } finally {
    close();
  }
});

test("the events SSE endpoint emits a sync frame, then live frames", async () => {
  const { deps } = makeDeps();
  const { base, close } = await serve(deps);
  try {
    const res = await fetch(`${base}/conversations/c9/events`);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    if (res.body === null) throw new Error("expected res.body to be non-null");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    // First frame must be the sync catch-up.
    while (!buf.includes("\n\n") || !buf.includes("sync")) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
    }
    expect(buf).toContain('"type":"sync"');
    deps.relay.publish("agent-1/c9", { type: "text", data: "live!" });
    while (!buf.includes("live!")) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
    }
    expect(buf).toContain('"type":"text"');
    await reader.cancel();
  } finally {
    close();
  }
});

test("cancel reports whether a turn was actually in flight (so the client can settle an orphaned card)", async () => {
  const { deps } = makeDeps();
  const { base, close } = await serve(deps);
  try {
    // No turn in flight → nothing to abort. `cancelled:false` is the signal the
    // client uses to settle a card stuck "running" after the turn died (e.g. an
    // app restart dropped the in-memory turn). Previously this was always {ok:true}.
    const orphan = await fetch(`${base}/conversations/c-orphan/cancel`, {
      method: "POST",
    });
    expect(orphan.status).toBe(200);
    expect(await orphan.json()).toEqual({ ok: true, cancelled: false });

    // A live turn IS in flight → cancel aborts it and reports cancelled:true, so
    // the client leaves the status to the turn's own terminal frame (no race).
    let release: (() => void) | undefined;
    const claimed = await deps.relay.start(
      "agent-1",
      "agent-1/c-live",
      (_publish, signal) =>
        new Promise<void>((resolve) => {
          if (signal.aborted) return resolve();
          signal.addEventListener("abort", () => resolve());
          release = resolve;
        }),
    );
    expect(claimed).toBe(true);
    const live = await fetch(`${base}/conversations/c-live/cancel`, {
      method: "POST",
    });
    expect(await live.json()).toEqual({ ok: true, cancelled: true });
    release?.();
  } finally {
    close();
  }
});
