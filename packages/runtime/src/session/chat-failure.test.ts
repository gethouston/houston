import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-chat-"));
process.env.HOUSTON_WORKSPACE_DIR = process.env.HOUSTON_DATA_DIR;
const { runTurn } = await import("./chat");
const { getHistory } = await import("../store/conversations");
const { subscribe } = await import("./bus");
const { recordServedScope, resetServedScopes } = await import(
  "../auth/served-scope"
);
const { runWithActingContext } = await import("./acting-context");

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

test("a disconnected-local-model failure persists a typed unauthenticated error with the undelivered prompt", async () => {
  await runTurn("conv-fail-3", "everything is okey?", undefined, {
    provider: "openai-compatible",
  });

  const history = getHistory("conv-fail-3");
  const assistant = history?.messages.at(-1);
  expect(assistant?.providerError).toMatchObject({
    kind: "unauthenticated",
    provider: "openai-compatible",
    cause: "no_credentials",
    undelivered_prompt: "everything is okey?",
  });
  expect((assistant?.providerError as { message?: string }).message).toContain(
    "No local model configured",
  );
});

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
    await runTurn(
      "conv-fail-2",
      "hello",
      "nonce-123",
      {
        provider: "openai-compatible",
      },
      undefined,
      undefined,
      undefined,
      undefined,
      "accepted-turn-id",
    );
  } finally {
    unsub();
  }

  const user = frames.find((f) => f.type === "user");
  const error = frames.find((f) => f.type === "error");
  expect(user).toBeDefined();
  expect(error).toBeDefined();
  expect(user?.nonce).toBe("nonce-123");
  expect(user?.turnId).toBe("accepted-turn-id");
  expect(getHistory("conv-fail-2")?.messages[0]).toMatchObject({
    nonce: "nonce-123",
    turnId: "accepted-turn-id",
  });
  expect(error?.turnId).toBe(user?.turnId);
  expect(frames.indexOf(user as never)).toBeLessThan(
    frames.indexOf(error as never),
  );
});

test("a pre-execution failure under a personal scope stamps the credential context", async () => {
  resetServedScopes();
  const acting = {
    actingAs: `acting-v1.${Buffer.from(
      JSON.stringify({ sub: "sub-stamp", agent: "acme", exp: 9_000_000_000 }),
    ).toString("base64url")}.sig`,
  };
  await runWithActingContext(acting, async () => {
    recordServedScope("openai-compatible", "personal");
    await runTurn("conv-fail-4", "who am I?", undefined, {
      provider: "openai-compatible",
    });
  });

  const assistant = getHistory("conv-fail-4")?.messages.at(-1);
  expect(assistant?.providerError).toMatchObject({
    kind: "unauthenticated",
    provider: "openai-compatible",
    cause: "no_credentials",
    credential: { scope: "personal" },
  });
  resetServedScopes();
});

test("a pre-execution failure with no acting identity carries no credential stamp", async () => {
  resetServedScopes();
  await runTurn("conv-fail-5", "who am I?", undefined, {
    provider: "openai-compatible",
  });
  const assistant = getHistory("conv-fail-5")?.messages.at(-1);
  expect(assistant?.providerError).not.toHaveProperty("credential");
});
