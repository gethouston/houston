import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { expect, test } from "vitest";
import { houstonToolServerLost } from "./tool-server-lost";

const init = (servers: unknown): SDKMessage =>
  ({
    type: "system",
    subtype: "init",
    session_id: "s",
    mcp_servers: servers,
  }) as unknown as SDKMessage;

const toolResult = (content: unknown, isError = true): SDKMessage =>
  ({
    type: "user",
    message: {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "t1", is_error: isError, content },
      ],
    },
    session_id: "s",
  }) as unknown as SDKMessage;

test("an init that lists houston as connected is fine", () => {
  expect(
    houstonToolServerLost(init([{ name: "houston", status: "connected" }])),
  ).toBe(false);
});

test("an init with houston failed or absent means the tools are gone", () => {
  expect(
    houstonToolServerLost(init([{ name: "houston", status: "failed" }])),
  ).toBe(true);
  expect(houstonToolServerLost(init([]))).toBe(true);
  expect(
    houstonToolServerLost(init([{ name: "other", status: "connected" }])),
  ).toBe(true);
});

test("an init without the servers list (an older CLI) is not a verdict", () => {
  expect(houstonToolServerLost(init(undefined))).toBe(false);
});

test("the live signature: an error tool_result naming a houston tool as unavailable", () => {
  expect(
    houstonToolServerLost(
      toolResult(
        "<tool_use_error>Error: No such tool available: mcp__houston__integration_execute</tool_use_error>",
      ),
    ),
  ).toBe(true);
  expect(
    houstonToolServerLost(
      toolResult([
        {
          type: "text",
          text: "No such tool available: mcp__houston__ask_user",
        },
      ]),
    ),
  ).toBe(true);
});

test("other tool errors and successful results are left alone", () => {
  expect(
    houstonToolServerLost(toolResult("No such tool available: WebSearch")),
  ).toBe(false);
  expect(
    houstonToolServerLost(
      toolResult("No such tool available: mcp__houston__x", false),
    ),
  ).toBe(false);
  expect(
    houstonToolServerLost({
      type: "assistant",
      message: { content: [] },
    } as unknown as SDKMessage),
  ).toBe(false);
});
