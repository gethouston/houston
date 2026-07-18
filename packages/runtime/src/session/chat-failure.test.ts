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
const { subscribe } = await import("./bus");

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

/**
 * The failure must be RENDERABLE by a live turn stream, not just persisted:
 * the client sink adopts its turnId from the nonce-stamped `user` echo, and a
 * stamped `error` frame with no adopted id classifies as foreign and is
 * dropped — the turn then spins forever with no error and no reconnect card
 * (the disconnected-local-model repro). So the pre-execution failure path
 * publishes the SAME echo-then-error sequence as a normal turn, sharing one
 * turnId, echo first.
 */
test("a turn failing before execution publishes the nonce-stamped echo before the error", async () => {
  const frames: { type: string; turnId?: string; nonce?: string }[] = [];
  const unsub = subscribe("conv-fail-2", (f) => {
    frames.push({
      type: f.type,
      turnId: f.turnId,
      nonce: (f.data as { nonce?: string })?.nonce,
    });
  });
  try {
    await runTurn("conv-fail-2", "hello", "nonce-123", {
      provider: "openai-compatible",
    });
  } finally {
    unsub();
  }

  const user = frames.find((f) => f.type === "user");
  const error = frames.find((f) => f.type === "error");
  expect(user).toBeDefined();
  expect(error).toBeDefined();
  // The echo carries OUR nonce (the sink's adoption key) and the error is
  // stamped with the SAME turnId, in echo-then-error order.
  expect(user?.nonce).toBe("nonce-123");
  expect(user?.turnId).toBeDefined();
  expect(error?.turnId).toBe(user?.turnId);
  expect(frames.indexOf(user as never)).toBeLessThan(
    frames.indexOf(error as never),
  );
});
