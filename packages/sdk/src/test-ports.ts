/**
 * The key/value store a test wires its SDK's two storage ports with.
 *
 * `storage` holds the SDK's own state (the session token); `devicePreferences`
 * holds the device's, which only the appearance module reads. A test that cares
 * what was stored passes its own Map and asserts on it; one that does not lets
 * each port have an empty store of its own.
 *
 * Test support, beside the code it supports: `rootDir` is `src`, so a helper
 * shared by the suites under `src/modules/**` has to live here.
 */

import type { KeyValueStore } from "./ports";

export function memoryKv(
  map: Map<string, string> = new Map<string, string>(),
): KeyValueStore {
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => void map.set(key, value),
    delete: async (key) => void map.delete(key),
  };
}
