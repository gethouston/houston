import type {
  AssistantMessage,
  Message,
  ToolResultMessage,
  Usage,
} from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import { estimatePromptTokens } from "./prompt-tokens";

function usage(totalTokens: number): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function assistant(
  totalTokens: number,
  stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    usage: usage(totalTokens),
    stopReason,
    timestamp: 0,
  };
}

function toolResult(text: string): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: "t1",
    toolName: "read",
    content: [{ type: "text", text }],
    isError: false,
    timestamp: 0,
  };
}

const user = (content: string): Message => ({
  role: "user",
  content,
  timestamp: 0,
});

test("with no answered request yet, every character is counted", () => {
  expect(
    estimatePromptTokens({
      systemPrompt: "s".repeat(400),
      messages: [user("x".repeat(4000))],
    }),
  ).toBe(1100);
});

test("the last answer's usage covers everything before it, the rest is counted", () => {
  expect(
    estimatePromptTokens({
      systemPrompt: "s".repeat(400),
      messages: [
        user("x".repeat(4000)),
        assistant(800_000),
        toolResult("y".repeat(4000)),
      ],
    }),
  ).toBe(801_000);
});

test("a failed answer's usage is not the prompt's size", () => {
  expect(
    estimatePromptTokens({
      messages: [
        assistant(600_000),
        user("x".repeat(400)),
        assistant(3, "error"),
      ],
    }),
  ).toBe(600_100);
});
