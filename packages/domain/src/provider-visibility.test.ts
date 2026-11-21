import { expect, test } from "vitest";
import { isHiddenProviderId } from "./provider-visibility";

const piKnows = (id: string) =>
  [
    "minimax",
    "moonshotai",
    "anthropic",
    "openai-codex",
    "groq",
    "cloudflare-ai-gateway",
  ].includes(id);

test("hides the providers Houston surfaces no connect card for", () => {
  for (const id of [
    "cloudflare-workers-ai",
    "cloudflare-ai-gateway",
    "kimi-coding",
    "ant-ling",
    "xiaomi-token-plan-cn",
  ])
    expect(isHiddenProviderId(id, piKnows)).toBe(true);
});

test("hides a regional duplicate only when its parent also ships", () => {
  expect(isHiddenProviderId("minimax-cn", piKnows)).toBe(true);
  expect(isHiddenProviderId("zai-coding-cn", piKnows)).toBe(false);
  expect(isHiddenProviderId("cloudflare-ai-gateway-cn", piKnows)).toBe(false);
});

test("keeps Houston's display id for the Codex subscription connectable", () => {
  expect(isHiddenProviderId("openai", piKnows)).toBe(false);
  expect(isHiddenProviderId("openai-codex", piKnows)).toBe(false);
  expect(isHiddenProviderId("anthropic", piKnows)).toBe(false);
});
