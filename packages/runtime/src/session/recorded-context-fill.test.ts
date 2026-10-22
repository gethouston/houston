import type { ChatMessage, TokenUsage } from "@houston/runtime-client";
import { expect, test } from "vitest";
import { recordedContextFill } from "./recorded-context-fill";

const fill = (context_tokens: number): TokenUsage => ({
  context_tokens,
  output_tokens: 10,
  cached_tokens: 0,
});
const user: ChatMessage = { role: "user", content: "Go on.", ts: 0 };
const reply = (extra: Partial<ChatMessage>): ChatMessage => ({
  role: "assistant",
  content: "",
  ts: 0,
  ...extra,
});
const timedOut: ChatMessage["providerError"] = {
  kind: "provider_internal",
  provider: "anthropic",
  http_status: null,
  message: "API Error: Request timed out.",
};

test("the fill is the last reply's recorded usage", () => {
  expect(
    recordedContextFill([
      user,
      reply({ usage: fill(400_000) }),
      user,
      reply({ usage: fill(812_345) }),
    ]),
  ).toBe(812_345);
});

test("a failed reply's zero usage does not erase the fill before it", () => {
  expect(
    recordedContextFill([
      user,
      reply({ usage: fill(812_345) }),
      user,
      reply({ usage: fill(0), providerError: timedOut }),
    ]),
  ).toBe(812_345);
});

test("a compaction after the last measured reply leaves the fill unknown", () => {
  expect(
    recordedContextFill([
      reply({ usage: fill(812_345) }),
      reply({ compaction: { trigger: "proactive", pre_tokens: 812_345 } }),
      user,
      reply({ usage: fill(0), providerError: timedOut }),
    ]),
  ).toBeUndefined();
});
