import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isInteractionStep, parsePendingInteraction } from "@houston/protocol";
import { expect, test } from "vitest";
import {
  newInteractionHolder,
  recordConnection,
  recordCredentialRequest,
  recordProviderConnection,
  recordQuestions,
  runWithInteractionCapture,
} from "../interaction";
import { runWithTurnMode } from "../turn-mode-context";
import { makeRequestProviderConnectionTool } from "./request-provider-connection";

const tool = makeRequestProviderConnectionTool();
const execute = (provider: string, reason?: string) =>
  tool.execute(
    "id",
    { provider, reason },
    undefined,
    undefined,
    {} as ExtensionContext,
  );

test("accepts curated and additional catalog providers without connected credentials", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    await execute(" OpenAI-Codex ", "  Run the requested model  ");
    await execute("groq");
    await execute("openai-codex", "Updated reason");
  });
  expect(holder.pending?.steps).toEqual([
    {
      kind: "provider_connect",
      id: "p1",
      provider: "openai-codex",
      reason: "Updated reason",
    },
    { kind: "provider_connect", id: "p2", provider: "groq" },
  ]);
});

test("rejects empty and unknown provider ids before queuing", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    for (const provider of [" ", "not-a-provider"])
      await expect(execute(provider)).rejects.toThrow("Unknown AI provider");
  });
  expect(holder.pending).toBeUndefined();
});

test("live Plan prevents cards, while auto permits them", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    await expect(
      runWithTurnMode({ current: "plan" }, () => execute("openai")),
    ).rejects.toThrow("Plan mode");
    expect(holder.pending).toBeUndefined();
    await runWithTurnMode({ current: "auto" }, () => execute("openai"));
  });
  expect(holder.pending?.steps[0]?.kind).toBe("provider_connect");
});

test("provider cards compose with questions and integration cards and are turn scoped", () => {
  const holder = newInteractionHolder();
  runWithInteractionCapture(holder, () => {
    recordProviderConnection({ provider: "openai" });
    recordQuestions([
      { kind: "question", id: "q1", question: "Which project?" },
    ]);
    recordConnection({ toolkit: "gmail" });
    recordCredentialRequest({ toolkit: "acme" });
  });
  expect(holder.pending?.steps.map((step) => step.kind)).toEqual([
    "question",
    "connect",
    "credential",
    "provider_connect",
  ]);
  recordProviderConnection({ provider: "anthropic" });
  expect(newInteractionHolder().pending).toBeUndefined();
  expect(holder.providerConnects).toHaveLength(1);
});

test("wire parser validates provider ids and optional reason structurally", () => {
  const valid = {
    kind: "provider_connect",
    id: "p1",
    provider: "openai",
    reason: "Use your model",
  };
  expect(parsePendingInteraction({ steps: [valid] })).toEqual({
    steps: [valid],
  });
  for (const malformed of [
    { ...valid, provider: " " },
    { ...valid, provider: 3 },
    { ...valid, reason: 3 },
    { ...valid, id: null },
  ])
    expect(isInteractionStep(malformed)).toBe(false);
});
