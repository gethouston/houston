import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  type CachedFrame,
  type CacheRecord,
  type ConversationCacheBackend,
  clearConversationCache,
  conversationCacheScope,
  deleteCachedConversation,
  jwtSub,
  MAX_CACHED_CONVERSATIONS,
  readCachedConversation,
  setConversationCacheBackend,
  setConversationCacheIdentity,
  writeCachedConversation,
} from "../src/engine-adapter/conversation-cache";

/**
 * The local conversation cache (HOU-712): per-gateway+user scoping, round
 * trips, corruption tolerance, prune, and the never-throws guarantee — the
 * cache is an accelerator, so any storage failure must degrade to "no cache",
 * never break the chat.
 */

function memoryBackend(): ConversationCacheBackend & {
  map: Map<string, CacheRecord>;
} {
  const map = new Map<string, CacheRecord>();
  return {
    map,
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
}

const FRAMES: CachedFrame[] = [
  { feed_type: "user_message", data: "hi" },
  { feed_type: "assistant_text", data: "hello!" },
];

let backend: ReturnType<typeof memoryBackend>;

beforeEach(() => {
  backend = memoryBackend();
  setConversationCacheBackend(backend);
  setConversationCacheIdentity(() => "https://gw|user-1");
});

afterEach(() => {
  setConversationCacheBackend(undefined);
  setConversationCacheIdentity(() => null);
  vi.useRealTimers();
});

function fakeJwt(payload: object): string {
  const b64u = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64u({ alg: "none" })}.${b64u(payload)}.sig`;
}

test("jwtSub extracts the sub claim, null for anything unreadable", () => {
  expect(jwtSub(fakeJwt({ sub: "user-42" }))).toBe("user-42");
  expect(jwtSub(fakeJwt({ role: "authenticated" }))).toBeNull();
  expect(jwtSub("not-a-jwt")).toBeNull();
  expect(jwtSub("")).toBeNull();
  expect(jwtSub("a.%%%.c")).toBeNull();
});

test("conversationCacheScope keys per gateway + user, null without a user", () => {
  expect(
    conversationCacheScope("https://gw", fakeJwt({ sub: "user-42" })),
  ).toBe("https://gw|user-42");
  expect(conversationCacheScope("https://gw", "static-token")).toBeNull();
});

test("write/read round trip", async () => {
  await writeCachedConversation("Ws/Agent", "sess-1", FRAMES);
  expect(await readCachedConversation("Ws/Agent", "sess-1")).toEqual(FRAMES);
  expect(await readCachedConversation("Ws/Agent", "other")).toBeNull();
});

test("no identity (local engine / static token) disables the cache", async () => {
  setConversationCacheIdentity(() => null);
  await writeCachedConversation("Ws/Agent", "sess-1", FRAMES);
  expect(backend.map.size).toBe(0);
  expect(await readCachedConversation("Ws/Agent", "sess-1")).toBeNull();
});

test("transcripts never leak across users", async () => {
  await writeCachedConversation("Ws/Agent", "sess-1", FRAMES);
  setConversationCacheIdentity(() => "https://gw|user-2");
  expect(await readCachedConversation("Ws/Agent", "sess-1")).toBeNull();
});

test("a corrupt record reads as no cache", async () => {
  await writeCachedConversation("Ws/Agent", "sess-1", FRAMES);
  const key = [...backend.map.keys()][0];
  backend.map.set(key, {
    frames: [{ nope: true }] as unknown as CachedFrame[],
    updatedAt: 1,
  });
  expect(await readCachedConversation("Ws/Agent", "sess-1")).toBeNull();
});

test("empty frame lists are not persisted", async () => {
  await writeCachedConversation("Ws/Agent", "sess-1", []);
  expect(backend.map.size).toBe(0);
});

test("delete drops one conversation, clear drops everything", async () => {
  await writeCachedConversation("Ws/Agent", "sess-1", FRAMES);
  await writeCachedConversation("Ws/Agent", "sess-2", FRAMES);
  await deleteCachedConversation("Ws/Agent", "sess-1");
  expect(await readCachedConversation("Ws/Agent", "sess-1")).toBeNull();
  expect(await readCachedConversation("Ws/Agent", "sess-2")).toEqual(FRAMES);
  await clearConversationCache();
  expect(backend.map.size).toBe(0);
});

test("prune evicts the oldest transcripts past the cap", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  for (let i = 0; i < MAX_CACHED_CONVERSATIONS + 3; i++) {
    vi.setSystemTime(1_000 + i);
    await writeCachedConversation("Ws/Agent", `sess-${i}`, FRAMES);
  }
  expect(backend.map.size).toBe(MAX_CACHED_CONVERSATIONS);
  expect(await readCachedConversation("Ws/Agent", "sess-0")).toBeNull();
  expect(await readCachedConversation("Ws/Agent", "sess-2")).toBeNull();
  expect(await readCachedConversation("Ws/Agent", "sess-3")).toEqual(FRAMES);
});

test("a broken backend degrades to no cache instead of throwing", async () => {
  const boom = async () => {
    throw new Error("storage exploded");
  };
  setConversationCacheBackend({
    get: boom,
    set: boom,
    delete: boom,
    keysOldestFirst: boom,
    clear: boom,
  });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await expect(
    writeCachedConversation("Ws/Agent", "sess-1", FRAMES),
  ).resolves.toBeUndefined();
  expect(await readCachedConversation("Ws/Agent", "sess-1")).toBeNull();
  await expect(
    deleteCachedConversation("Ws/Agent", "s"),
  ).resolves.toBeUndefined();
  await expect(clearConversationCache()).resolves.toBeUndefined();
  warn.mockRestore();
});
