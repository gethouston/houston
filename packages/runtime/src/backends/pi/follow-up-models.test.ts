import { expect, test } from "vitest";
import { buildOpenAiCompatibleModel } from "../../ai/openai-compatible-model";
import { followUpPassServes } from "./follow-up-models";

test("hosted APIs get the follow-up pass", () => {
  for (const model of [
    { api: "openai-codex-responses", provider: "openai-codex" },
    { api: "openai-responses", provider: "openai" },
    { api: "azure-openai-responses", provider: "azure-openai-responses" },
    { api: "openai-completions", provider: "openrouter" },
    { api: "anthropic-messages", provider: "anthropic" },
    { api: "google-generative-ai", provider: "google" },
    { api: "google-vertex", provider: "google-vertex" },
  ])
    expect(followUpPassServes(model), model.provider).toBe(true);
});

test("a custom endpoint, a local model or an unknown host never waits on it", () => {
  const custom = buildOpenAiCompatibleModel({
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "llama3",
  });
  expect(followUpPassServes(custom)).toBe(false);
  for (const model of [
    { api: "openai-completions", provider: "ollama" },
    { api: "openai-responses", provider: "some-gateway" },
    { api: "anthropic-messages", provider: "kimi-coding" },
    { api: "mistral-conversations", provider: "mistral" },
  ])
    expect(followUpPassServes(model), model.provider).toBe(false);
});
