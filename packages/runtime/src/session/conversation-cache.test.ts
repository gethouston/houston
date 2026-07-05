import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

// Point the runtime's config at throwaway dirs BEFORE the module graph loads
// (config reads these at import), so importing conversation-cache — which wires
// the backends at module load — doesn't touch the real ~/.houston.
process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-cc-data-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-cc-ws-"),
);

// Importing conversation-cache runs its module-level registration side effects:
// setDefaultBackend(pi) + registerBackend("anthropic", claude).
await import("./conversation-cache");
const { backendFor } = await import("../backends/registry");

test("the anthropic provider resolves to the Claude backend, not pi", () => {
  const backend = backendFor("anthropic");
  // The Claude Agent SDK backend registers under id "anthropic"; a fall-through
  // to the pi default (id "pi") would mean anthropic turns ran on pi's in-process
  // client — the harness-spoofing path the compliance gate forbids.
  expect(backend.id).toBe("anthropic");
  expect(backend.id).not.toBe("pi");
});

test("every other provider falls through to the pi default backend", () => {
  expect(backendFor("openai-codex").id).toBe("pi");
  expect(backendFor("google").id).toBe("pi");
});
