import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-cc-data-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-cc-ws-"),
);

const { serverBackendFor } = await import("./conversation-backends");

test("the anthropic provider resolves to the Claude backend, not pi", () => {
  const backend = serverBackendFor("anthropic");
  expect(backend.id).toBe("anthropic");
  expect(backend.id).not.toBe("pi");
});

test("every other provider falls through to the pi default backend", () => {
  expect(serverBackendFor("openai-codex").id).toBe("pi");
  expect(serverBackendFor("google").id).toBe("pi");
});
