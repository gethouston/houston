import { feedItemsToMessages, startedMissions } from "@houston-ai/chat";
import { conversationScope } from "@houston/sdk";
import { expect, test } from "vitest";
import { computeTurnEndSummary } from "../../../ui/chat/src/turn-tools";
import { conversationStore, conversationVm } from "../../engine-adapter/src/vm";
import { createStreamTranslator } from "../../runtime/src/backends/claude/translate";
import { TurnSink } from "../../sdk/src/modules/turns/turn-sink";

test("a Claude MCP result text reaches the live VM and started-mission card", () => {
  const mission = {
    id: "mission-live",
    title: "Collect documents",
    agent: "Ada",
  };
  const scope = conversationScope("Personal/Assistant", "live-receipt");
  const sink = new TurnSink({
    agentPath: "Personal/Assistant",
    sessionKey: "live-receipt",
    output: conversationVm,
    mode: "observer",
    stop: () => {},
    reloadHistory: async () => [],
    historyGuard: () => false,
  });
  const translator = createStreamTranslator({ onContextTokens: () => {} });
  const messages: Parameters<typeof translator.translate>[0][] = [
    {
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "tool-1",
          name: "mcp__houston__start_mission",
          input: {},
        },
      },
    },
    { type: "stream_event", event: { type: "content_block_stop", index: 0 } },
    {
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool-1",
            is_error: false,
            content: [{ type: "text", text: JSON.stringify({ mission }) }],
          },
        ],
      },
    },
  ] as unknown as Parameters<typeof translator.translate>[0][];
  for (const message of messages) {
    for (const event of translator.translate(message)) sink.onFrame(event);
  }
  const feed = conversationStore.getSnapshot(scope)?.feed ?? [];
  expect(
    feed.find((frame) => frame.feed_type === "tool_result")?.data,
  ).toHaveProperty("mission", mission);
  const rendered = feedItemsToMessages(feed);
  const summary = computeTurnEndSummary(rendered, "ready").get(
    rendered.length - 1,
  );
  expect(summary && startedMissions(summary)).toEqual([mission]);
});

test("a Claude turn with several tool calls pairs the mission receipt to start_mission", () => {
  const mission = {
    id: "mission-batch",
    title: "Collect documents",
    agent: "Ada",
  };
  const sessionKey = "live-batch";
  const sink = new TurnSink({
    agentPath: "Personal/Assistant",
    sessionKey,
    output: conversationVm,
    mode: "observer",
    stop: () => {},
    reloadHistory: async () => [],
    historyGuard: () => false,
  });
  const translator = createStreamTranslator({ onContextTokens: () => {} });
  const toolNames = [
    "mcp__houston__houston_describe",
    "mcp__houston__houston_call",
    "mcp__houston__start_mission",
  ];
  const messages = [
    ...toolNames.flatMap((name, index) => [
      {
        type: "stream_event",
        event: {
          type: "content_block_start",
          index,
          content_block: {
            type: "tool_use",
            id: `tool-${index}`,
            name,
            input: {},
          },
        },
      },
      { type: "stream_event", event: { type: "content_block_stop", index } },
    ]),
    {
      type: "user",
      message: {
        role: "user",
        content: toolNames.map((_, index) => ({
          type: "tool_result",
          tool_use_id: `tool-${index}`,
          is_error: false,
          content: index === 2 ? JSON.stringify({ mission }) : "{}",
        })),
      },
    },
  ] as unknown as Parameters<typeof translator.translate>[0][];
  for (const message of messages) {
    for (const event of translator.translate(message)) sink.onFrame(event);
  }
  const feed =
    conversationStore.getSnapshot(
      conversationScope("Personal/Assistant", sessionKey),
    )?.feed ?? [];
  expect(
    feed.find(
      (frame) =>
        frame.feed_type === "tool_result" &&
        (frame.data as { name?: string }).name ===
          "mcp__houston__start_mission",
    )?.data,
  ).toHaveProperty("mission", mission);
  const rendered = feedItemsToMessages(feed);
  const summary = computeTurnEndSummary(rendered, "ready").get(
    rendered.length - 1,
  );
  expect(summary && startedMissions(summary)).toEqual([mission]);
});
