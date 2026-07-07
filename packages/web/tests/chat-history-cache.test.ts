import { conversationScope } from "@houston/sdk";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";
import {
  type CachedFrame,
  type CacheRecord,
  type ConversationCacheBackend,
  setConversationCacheBackend,
  setConversationCacheIdentity,
} from "../src/engine-adapter/conversation-cache";
import { conversationStore } from "../src/engine-adapter/vm";

/**
 * loadChatHistory × the local conversation cache (HOU-712): opening a cloud
 * chat paints the VM from the cached transcript IMMEDIATELY — even while the
 * gateway holds the history read for an engine-pod cold start — and every
 * successful read refreshes the cache. A 404 (conversation gone) drops both
 * the cache entry and the cache-seeded VM.
 */

function memoryBackend() {
  const map = new Map<string, CacheRecord>();
  const backend: ConversationCacheBackend = {
    get: async (key) => map.get(key) ?? null,
    set: async (key, record) => {
      map.set(key, record);
    },
    delete: async (key) => {
      map.delete(key);
    },
    keysOldestFirst: async () =>
      [...map.entries()]
        .sort(([, a], [, z]) => a.updatedAt - z.updatedAt)
        .map(([key]) => key),
    clear: async () => {
      map.clear();
    },
  };
  return { map, backend };
}

const GW = "https://gateway.example";

function fakeJwt(sub: string): string {
  const b64u = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64u({ alg: "none" })}.${b64u({ sub })}.sig`;
}

const CACHED: CachedFrame[] = [
  { feed_type: "user_message", data: "cached question" },
  { feed_type: "assistant_text", data: "cached answer" },
];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function vmFeed(agentPath: string, sessionKey: string): unknown[] {
  const snap = conversationStore.getSnapshot(
    conversationScope(agentPath, sessionKey),
  ) as { feed?: { feed_type: string; data: unknown }[] } | undefined;
  return (snap?.feed ?? []).map((f) => ({
    feed_type: f.feed_type,
    data: f.data,
  }));
}

let store: ReturnType<typeof memoryBackend>;
const originalFetch = globalThis.fetch;
let convSeq = 0;

beforeEach(() => {
  store = memoryBackend();
  setConversationCacheBackend(store.backend);
});

afterEach(() => {
  setConversationCacheBackend(undefined);
  setConversationCacheIdentity(() => null);
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

/** A cloud client; its constructor installs the cache identity for GW+sub. */
function cloudClient(): HoustonClient {
  return new HoustonClient({
    baseUrl: GW,
    token: fakeJwt("user-1"),
    controlPlane: true,
  });
}

async function seedCache(agentPath: string, sessionKey: string): Promise<void> {
  await store.backend.set(
    `${GW}|user-1|${encodeURIComponent(agentPath)}|${encodeURIComponent(sessionKey)}`,
    { frames: CACHED, updatedAt: 1 },
  );
}

test("a held history read paints the chat from the cache immediately", async () => {
  const agentPath = "Ws/Agent";
  const sessionKey = `held-${convSeq++}`;
  const client = cloudClient();
  await seedCache(agentPath, sessionKey);
  // The gateway holds the read for a cold pod: the fetch never resolves.
  globalThis.fetch = vi.fn(
    () => new Promise<Response>(() => {}),
  ) as unknown as typeof fetch;

  const pending = client.loadChatHistory(agentPath, sessionKey);
  await vi.waitFor(() => expect(vmFeed(agentPath, sessionKey)).toEqual(CACHED));
  // The read is still held — nothing resolved, nothing threw.
  let settled = false;
  void pending.finally(() => {
    settled = true;
  });
  await new Promise((r) => setTimeout(r, 20));
  expect(settled).toBe(false);
});

test("a successful read refreshes the cache and reseeds the VM", async () => {
  const agentPath = "Ws/Agent";
  const sessionKey = `fresh-${convSeq++}`;
  const client = cloudClient();
  await seedCache(agentPath, sessionKey);
  const messages = [
    { role: "user", content: "cached question", ts: 1 },
    { role: "assistant", content: "cached answer", ts: 2 },
    { role: "user", content: "new question", ts: 3 },
    { role: "assistant", content: "new answer", ts: 4 },
  ];
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes("/messages")) {
      return json(200, { id: sessionKey, title: "t", messages });
    }
    // The post-load observer stream: an empty body ends it immediately.
    return new Response("", { status: 200 });
  }) as unknown as typeof fetch;

  const feed = await client.loadChatHistory(agentPath, sessionKey, {
    observe: false,
  });
  expect(feed.map((f) => f.data)).toEqual([
    "cached question",
    "cached answer",
    "new question",
    "new answer",
  ]);
  await vi.waitFor(async () => {
    const key = `${GW}|user-1|${encodeURIComponent(agentPath)}|${encodeURIComponent(sessionKey)}`;
    const record = await store.backend.get(key);
    expect(record?.frames.length).toBe(4);
  });
});

test("a 404 drops the cache entry and clears the cache-seeded VM", async () => {
  const agentPath = "Ws/Agent";
  const sessionKey = `gone-${convSeq++}`;
  const client = cloudClient();
  await seedCache(agentPath, sessionKey);
  globalThis.fetch = vi.fn(async () =>
    json(404, { error: "not found" }),
  ) as unknown as typeof fetch;

  const feed = await client.loadChatHistory(agentPath, sessionKey);
  expect(feed).toEqual([]);
  expect(vmFeed(agentPath, sessionKey)).toEqual([]);
  await vi.waitFor(async () => {
    expect(await store.backend.keysOldestFirst()).toEqual([]);
  });
});

test("a real failure still surfaces (cache-first never swallows the error)", async () => {
  const agentPath = "Ws/Agent";
  const sessionKey = `boom-${convSeq++}`;
  const client = cloudClient();
  await seedCache(agentPath, sessionKey);
  globalThis.fetch = vi.fn(async () =>
    json(500, { error: "pod exploded" }),
  ) as unknown as typeof fetch;

  await expect(client.loadChatHistory(agentPath, sessionKey)).rejects.toThrow();
  // The cached paint survives the failure — the user keeps their transcript.
  expect(vmFeed(agentPath, sessionKey)).toEqual(CACHED);
});
