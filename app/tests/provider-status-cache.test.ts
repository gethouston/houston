import assert from "node:assert/strict";
import test from "node:test";
import {
  loadCachedProviderStatuses,
  saveCachedProviderStatuses,
} from "../src/lib/provider-status-cache.ts";
import type { ProviderStatus } from "../src/lib/tauri.ts";

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    dump: () => Object.fromEntries(store),
  };
}

const CONNECTED: ProviderStatus = {
  provider: "anthropic",
  cli_installed: true,
  auth_state: "authenticated",
  authenticated: true,
  cli_name: "claude",
};

test("round-trips a status snapshot", () => {
  const storage = memoryStorage();
  saveCachedProviderStatuses({ anthropic: CONNECTED }, storage);
  assert.deepEqual(loadCachedProviderStatuses(storage), {
    anthropic: CONNECTED,
  });
});

test("empty storage yields an empty snapshot", () => {
  assert.deepEqual(loadCachedProviderStatuses(memoryStorage()), {});
});

test("corrupt JSON yields an empty snapshot", () => {
  const storage = memoryStorage({
    "houston.providerStatusCache.v1": "{not json",
  });
  assert.deepEqual(loadCachedProviderStatuses(storage), {});
});

test("malformed entries are dropped, valid ones kept", () => {
  const storage = memoryStorage({
    "houston.providerStatusCache.v1": JSON.stringify({
      anthropic: CONNECTED,
      openai: { provider: "openai" }, // missing fields
      google: "authenticated", // not an object
    }),
  });
  assert.deepEqual(loadCachedProviderStatuses(storage), {
    anthropic: CONNECTED,
  });
});

test("a throwing storage backend is treated as no cache", () => {
  const throwing = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
  assert.deepEqual(loadCachedProviderStatuses(throwing), {});
  assert.doesNotThrow(() =>
    saveCachedProviderStatuses({ anthropic: CONNECTED }, throwing),
  );
});
