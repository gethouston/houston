import type { WireFrame } from "@houston/runtime-client";
import { expect, test } from "vitest";
import type { FeedOutput } from "./feed-output";
import { applyTurnFrame } from "./turn-frames";
import { newTurnState } from "./turn-settle";

/**
 * The context-boundary frames are what a `/clear` and a `/compact` turn are
 * made of: neither produces assistant text, so if the fold dropped them the
 * turn would settle showing the user nothing at all.
 */

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
