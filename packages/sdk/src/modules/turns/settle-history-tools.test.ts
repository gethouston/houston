import type { ChatMessage } from "@houston/runtime-client";
import { expect, test } from "vitest";
import type { FeedOutput } from "./feed-output";
import { reloadAndSettle } from "./settle-from-history";
import { newTurnState, type TurnState } from "./turn-settle";

type Item = {
  feed_type?: string;
  data?: unknown;
  toolIndex?: number;
  turnId?: string;
};

const TURN = "t-goal";
const MISSION = { id: "goal-mission", title: "Chase invoices", agent: "Avery" };

function state(): { s: TurnState; items: Item[] } {
  const items: Item[] = [];
  const output: FeedOutput = {
    pushFeedItem: (_a, _s, item) => {
      items.push(item as Item);
    },
    sessionStatus: () => {},
    persistBoardStatus: async () => {},
  };
  const s = newTurnState("Houston/.assistant", "assistant", output);
  s.delivered = true;
  return { s, items };
}

function history(reply: Partial<ChatMessage>): ChatMessage[] {
  return [
    { role: "user", content: "Start my goal", ts: 1, turnId: TURN },
    { role: "assistant", content: "", ts: 2, turnId: TURN, ...reply },
  ];
}

const settle = (s: TurnState, messages: ChatMessage[]) =>
  reloadAndSettle(
    s,
    async () => messages,
    TURN,
    () => true,
    () => {},
  );

const kinds = (items: Item[]) => items.map((item) => item.feed_type);

test("a turn settled from history keeps the tools it ran, a started mission included", async () => {
  const { s, items } = state();
  await settle(
    s,
    history({
      thinking: "Avery fits.",
      tools: [
        { name: "start_mission", input: { agent: "Avery" }, mission: MISSION },
      ],
    }),
  );
  expect(kinds(items)).toEqual([
    "thinking_streaming",
    "tool_call",
    "tool_result",
    "thinking",
    "final_result",
  ]);
  expect(items[1]).toMatchObject({
    data: { name: "start_mission", input: { agent: "Avery" } },
    toolIndex: 0,
    turnId: TURN,
  });
  expect(items[2]).toMatchObject({
    data: { name: "start_mission", is_error: false, mission: MISSION },
    toolIndex: 0,
    turnId: TURN,
  });
});

test("tools the live frames already pushed are never pushed twice", async () => {
  const { s, items } = state();
  s.toolsSeen = 1;
  await settle(
    s,
    history({
      content: "Done.",
      tools: [
        { name: "read_file", input: { path: "a" }, result: "ok" },
        { name: "start_mission", input: {}, mission: MISSION },
      ],
    }),
  );
  expect(kinds(items)).toEqual([
    "tool_result",
    "tool_call",
    "tool_result",
    "assistant_text",
    "final_result",
  ]);
  expect(items.map((item) => item.toolIndex)).toEqual([
    0,
    1,
    1,
    undefined,
    undefined,
  ]);
  expect(items[0]).toMatchObject({
    data: { name: "read_file", content: "ok" },
  });
});

test("a stopped turn's tools show without a reasoning row left streaming", async () => {
  const { s, items } = state();
  await settle(
    s,
    history({
      stopped: true,
      thinking: "Half a thought.",
      tools: [{ name: "read_file", input: {}, result: "ok", isError: false }],
    }),
  );
  expect(kinds(items)).not.toContain("thinking_streaming");
  expect(kinds(items).slice(0, 2)).toEqual(["tool_call", "tool_result"]);
});
