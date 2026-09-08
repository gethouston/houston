import { expect, test } from "vitest";
import {
  getPreference,
  loadPreferences,
  prefDocKey,
  setPreference,
} from "./preferences";
import type { TextStore } from "./store";

/** `readDelayMs` widens the read→write window so an interleave is deterministic
 *  rather than dependent on microtask ordering. */
function memStore(readDelayMs = 0): TextStore & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    async readText(key) {
      // Snapshot first, then stall: a slow read answers with the state it saw
      // when it started, which is exactly what makes a read-modify-write lose.
      const value = raw.get(key) ?? null;
      if (readDelayMs > 0)
        await new Promise((resolve) => setTimeout(resolve, readDelayMs));
      return value;
    },
    async writeText(key, content) {
      raw.set(key, content);
    },
  };
}

const WS = "w1";

test("set then get round-trips; missing keys are null", async () => {
  const store = memStore();
  expect(await getPreference(store, WS, "locale")).toBeNull();
  await setPreference(store, WS, "locale", "es");
  expect(await getPreference(store, WS, "locale")).toBe("es");
});

test("the doc lives above the agent prefixes (survives agent deletion)", async () => {
  const store = memStore();
  await setPreference(store, WS, "timezone", "America/Bogota");
  expect(store.raw.has(prefDocKey(WS))).toBe(true);
  expect(prefDocKey(WS)).toBe("ws/w1/preferences.json");
});

test("setting null clears a key but keeps the others", async () => {
  const store = memStore();
  await setPreference(store, WS, "locale", "pt");
  await setPreference(store, WS, "timezone", "UTC");
  const merged = await setPreference(store, WS, "locale", null);
  expect(merged).toEqual({ locale: null, timezone: "UTC" });
});

test("a corrupt (non-object) doc reads as empty, never crashes the boot gates", async () => {
  const store = memStore();
  store.raw.set(prefDocKey(WS), JSON.stringify(["not", "an", "object"]));
  expect(await loadPreferences(store, WS)).toEqual({});
  expect(await getPreference(store, WS, "locale")).toBeNull();
});

test("concurrent writes of DIFFERENT keys both survive the read-modify-write", async () => {
  const store = memStore(5);
  await Promise.all([
    setPreference(store, WS, "locale", "es"),
    setPreference(store, WS, "timezone", "America/Bogota"),
  ]);
  expect(await loadPreferences(store, WS)).toEqual({
    locale: "es",
    timezone: "America/Bogota",
  });
});
