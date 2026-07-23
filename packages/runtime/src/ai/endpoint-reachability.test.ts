import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, test } from "vitest";

// config reads HOUSTON_DATA_DIR at import time, and vitest gives each test
// file its own module registry — so point the data dir at a tmpdir BEFORE the
// dynamic import to keep the endpoint writes out of the real ~/.houston-ts.
process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-reach-"));
const { clearCustomEndpointConfig, setCustomEndpointConfig } = await import(
  "./openai-compatible"
);
const {
  endpointReachableCached,
  refreshEndpointReachability,
  resetEndpointReachability,
} = await import("./endpoint-reachability");

beforeEach(() => {
  resetEndpointReachability();
  clearCustomEndpointConfig();
});

test("no endpoint configured → nothing to probe, not reachable", async () => {
  expect(await refreshEndpointReachability(async () => true)).toBe(false);
  expect(endpointReachableCached()).toBe(false);
});

test("optimistic before the first probe: a configured endpoint reads reachable until a probe says otherwise", () => {
  setCustomEndpointConfig({ baseUrl: "http://127.0.0.1:1337/v1", model: "m" });
  // The status routes warm the cache before building rows; an unwarmed read
  // (boot, config just changed) must not flash a working server as down.
  expect(endpointReachableCached()).toBe(true);
});

test("a failed probe flips the endpoint to unreachable; a later success flips it back", async () => {
  setCustomEndpointConfig({ baseUrl: "http://127.0.0.1:1337/v1", model: "m" });
  expect(await refreshEndpointReachability(async () => false)).toBe(false);
  expect(endpointReachableCached()).toBe(false);
  resetEndpointReachability(); // step past the TTL
  expect(await refreshEndpointReachability(async () => true)).toBe(true);
  expect(endpointReachableCached()).toBe(true);
});

test("rapid refreshes reuse the fresh verdict (one probe per TTL window)", async () => {
  setCustomEndpointConfig({ baseUrl: "http://127.0.0.1:1337/v1", model: "m" });
  let calls = 0;
  const probe = async () => {
    calls += 1;
    return true;
  };
  await refreshEndpointReachability(probe);
  await refreshEndpointReachability(probe);
  expect(calls).toBe(1);
});

test("concurrent refreshes share one in-flight probe", async () => {
  setCustomEndpointConfig({ baseUrl: "http://127.0.0.1:1337/v1", model: "m" });
  let calls = 0;
  const probe = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 10));
    return true;
  };
  await Promise.all([
    refreshEndpointReachability(probe),
    refreshEndpointReachability(probe),
  ]);
  expect(calls).toBe(1);
});

test("a base-URL change invalidates the cached verdict (the old server's answer doesn't speak for the new one)", async () => {
  setCustomEndpointConfig({ baseUrl: "http://127.0.0.1:1337/v1", model: "m" });
  await refreshEndpointReachability(async () => false);
  expect(endpointReachableCached()).toBe(false);
  setCustomEndpointConfig({ baseUrl: "http://127.0.0.1:8080/v1", model: "m" });
  expect(endpointReachableCached()).toBe(true); // optimistic until probed
  expect(await refreshEndpointReachability(async () => false)).toBe(false);
  expect(endpointReachableCached()).toBe(false);
});

test("a reconfiguration mid-probe does NOT adopt the old URL's in-flight answer", async () => {
  setCustomEndpointConfig({ baseUrl: "http://127.0.0.1:1337/v1", model: "m" });
  let release: (() => void) | undefined;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const probed: string[] = [];
  const slowProbe = async (baseUrl: string) => {
    probed.push(baseUrl);
    await gate;
    return false; // the OLD server is down
  };
  const oldRefresh = refreshEndpointReachability(slowProbe);
  // Mid-probe the user points the config at a NEW server that is up.
  setCustomEndpointConfig({ baseUrl: "http://127.0.0.1:8080/v1", model: "m" });
  const newRefresh = refreshEndpointReachability(async (baseUrl) => {
    probed.push(baseUrl);
    return true;
  });
  (release as () => void)();
  expect(await newRefresh).toBe(true); // fresh probe of the NEW URL, not the old promise
  await oldRefresh;
  expect(probed).toEqual([
    "http://127.0.0.1:1337/v1",
    "http://127.0.0.1:8080/v1",
  ]);
  expect(endpointReachableCached()).toBe(true); // verdict keyed to the new URL
});

test("probes are keyed to the configured URL", async () => {
  setCustomEndpointConfig({ baseUrl: "http://127.0.0.1:1337/v1", model: "m" });
  const seen: string[] = [];
  await refreshEndpointReachability(async (baseUrl) => {
    seen.push(baseUrl);
    return true;
  });
  expect(seen).toEqual(["http://127.0.0.1:1337/v1"]);
});
