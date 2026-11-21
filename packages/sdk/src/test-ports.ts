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
