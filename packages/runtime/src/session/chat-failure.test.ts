import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

// Isolate this file's runtime state: config reads the env at import time, and
// vitest gives each test file its own module registry, so pointing the data
// dir at a tmpdir BEFORE importing keeps the failure-persistence writes out of
// the developer's real ~/.houston-ts.
process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-chat-"));
process.env.HOUSTON_WORKSPACE_DIR = process.env.HOUSTON_DATA_DIR;
const { runTurn } = await import("./chat");
const { getHistory } = await import("../store/conversations");

/**
 * A turn that fails BEFORE executing (a pin naming an unknown provider — a
 * junk id routinePin passed through verbatim) must persist its failure, not
 * just publish an ephemeral stream error: an unattended reader (the host's
 * routine reconcile) errors the run off the persisted providerError, instead
 * of finding no reply and timing out with a vague message 15 minutes later.
 */
test("a turn failing before execution persists the user message + typed providerError", async () => {
  await runTurn("conv-fail-1", "do the thing", undefined, {
    provider: "gemini-cli",
  });

  const history = getHistory("conv-fail-1");
  expect(history?.messages).toHaveLength(2);
  const [user, assistant] = history?.messages ?? [];
  expect(user).toMatchObject({ role: "user", content: "do the thing" });
  expect(assistant?.role).toBe("assistant");
  expect(assistant?.content).toBe("");
  expect(assistant?.providerError).toMatchObject({
    kind: "unknown",
    provider: "gemini-cli",
  });
  expect(
    (assistant?.providerError as { raw_excerpt?: string }).raw_excerpt,
  ).toContain("unknown provider: gemini-cli");
});
