import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

// config reads HOUSTON_DATA_DIR at import time, and vitest gives each test
// file its own module registry — so point the data dir at a tmpdir BEFORE the
// dynamic import to keep the endpoint writes out of the real ~/.houston-ts.
process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-oac-learn-"),
);
const {
  buildActiveCustomModel,
  clearCustomEndpointConfig,
  learnCustomContextWindow,
  setCustomEndpointConfig,
} = await import("./openai-compatible");

const endpointFile = join(process.env.HOUSTON_DATA_DIR, "custom-endpoint.json");
const storedWindow = () =>
  JSON.parse(readFileSync(endpointFile, "utf8")).contextWindow;

test("learnCustomContextWindow persists a provider-reported window smaller than the assumed default", () => {
  // The production incident: a Jan endpoint with no explicit window runs on the
  // assumed default (32768), but the server's real n_ctx is 8192 — so
  // autocompact never fired and every turn past 8192 tokens failed. The
  // overflow rejection names the truth; learning it must make the NEXT
  // resolveModel (and so autocompact's denominator) use it.
  setCustomEndpointConfig({
    baseUrl: "https://tunnel.example.com/v1",
    model: "Jan-v3.5-4B-Q4_K_XL",
  });
  expect(learnCustomContextWindow(8192)).toBe(true);
  expect(storedWindow()).toBe(8192);
  expect(buildActiveCustomModel().contextWindow).toBe(8192);
});

test("learnCustomContextWindow only ever shrinks — a larger report never raises the stored window", () => {
  // An overflow proves the window is AT MOST the reported value; nothing can
  // prove a larger one, and a user-set value must never be silently raised.
  expect(learnCustomContextWindow(32768)).toBe(false);
  expect(storedWindow()).toBe(8192);
});

test("learnCustomContextWindow rejects nonsense values", () => {
  expect(learnCustomContextWindow(0)).toBe(false);
  expect(learnCustomContextWindow(-8192)).toBe(false);
  expect(learnCustomContextWindow(4096.5)).toBe(false);
  expect(storedWindow()).toBe(8192);
});

test("learnCustomContextWindow is a no-op with no endpoint configured", () => {
  clearCustomEndpointConfig();
  expect(learnCustomContextWindow(8192)).toBe(false);
  expect(JSON.parse(readFileSync(endpointFile, "utf8"))).toEqual({});
});
