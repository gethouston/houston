import type { WireFrame } from "@houston/runtime-client";
import { expect, test } from "vitest";
import type { FeedOutput } from "./feed-output";
import { applyTurnFrame } from "./turn-frames";
import { newTurnState } from "./turn-settle";

function fold(frames: WireFrame[]): unknown[] {
  const items: unknown[] = [];
  const output = {
    pushFeedItem: (_agentPath: string, _sessionKey: string, item: unknown) => {
      items.push(item);
    },
  } as FeedOutput;
  const s = newTurnState("/agents/houston", "conv-1", output);
  for (const f of frames) applyTurnFrame(s, f, () => {});
  return items;
}

test("a cleared context becomes its own boundary item", () => {
  expect(fold([{ type: "context_cleared", data: null }])).toEqual([
    { feed_type: "context_cleared", data: null },
  ]);
});

test("a manual compaction carries its trigger to the feed", () => {
  expect(
    fold([
      { type: "context_compacted", data: { trigger: "manual", pre_tokens: 7 } },
    ]),
  ).toEqual([
    {
      feed_type: "context_compacted",
      data: { trigger: "manual", pre_tokens: 7 },
    },
  ]);
});

test("a live tool result carries the structured started mission receipt", () => {
  const mission = { id: "m1", title: "Research", agent: "Ada" };
  expect(
    fold([
      {
        type: "tool_end",
        data: { name: "start_mission", isError: false, mission },
      },
    ]),
  ).toEqual([
    {
      feed_type: "tool_result",
      data: { name: "start_mission", content: "", is_error: false, mission },
      toolIndex: 0,
    },
  ]);
});
