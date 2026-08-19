import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

// The REAL (uninjected) fingerprint path: config reads HOUSTON_DATA_DIR at
// import time, so pin it to a tmpdir before the dynamic imports (same pattern
// as openai-compatible.test.ts). Kept separate from credential-health.test.ts,
// which exercises the pure mark/heal logic with injected fingerprints.
process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-credfp-"));
const { setCustomEndpointConfig } = await import("../ai/openai-compatible");
const { authFailureActive, noteAuthFailure, resetAuthFailures } = await import(
  "./credential-health"
);
const { runWithActingContext } = await import("../session/acting-context");

afterEach(() => resetAuthFailures());

test("reconfiguring the local endpoint heals its failure mark (same placeholder key, new server)", () => {
  setCustomEndpointConfig({ baseUrl: "http://127.0.0.1:1337/v1", model: "m" });
  noteAuthFailure("openai-compatible"); // real fingerprint: endpoint A
  expect(authFailureActive("openai-compatible")).toBe(true);
  // Pointing the config at a different server is a different "credential" —
  // the mark must not keep the freshly configured endpoint disconnected.
  setCustomEndpointConfig({ baseUrl: "http://127.0.0.1:8080/v1", model: "m" });
  expect(authFailureActive("openai-compatible")).toBe(false);
});

test("an unchanged endpoint keeps its failure mark", () => {
  setCustomEndpointConfig({ baseUrl: "http://127.0.0.1:1337/v1", model: "m" });
  noteAuthFailure("openai-compatible");
  expect(authFailureActive("openai-compatible")).toBe(true);
  expect(authFailureActive("openai-compatible")).toBe(true);
});

test("turn-scoped fingerprints read the active turn auth path", () => {
  const root = mkdtempSync(join(tmpdir(), "houston-turn-credfp-"));
  const authPath = join(root, "data", "auth.json");
  mkdirSync(join(root, "data"), { recursive: true });
  writeFileSync(
    authPath,
    JSON.stringify({ openai: { type: "api_key", key: "turn-a" } }),
  );
  runWithActingContext({ credentialScopeKey: "u:turn:w:a", authPath }, () => {
    noteAuthFailure("openai");
    expect(authFailureActive("openai")).toBe(true);
    writeFileSync(
      authPath,
      JSON.stringify({ openai: { type: "api_key", key: "turn-b" } }),
    );
    expect(authFailureActive("openai")).toBe(false);
  });
});
