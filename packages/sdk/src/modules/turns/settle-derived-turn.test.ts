import type { ChatMessage } from "@houston/runtime-client";
import { expect, test } from "vitest";
import type { FeedOutput } from "./feed-output";
import {
  presettleFromHistory,
  reloadAndSettle,
  TURN_DIED_MESSAGE,
} from "./settle-from-history";
import { newTurnState, type TurnState } from "./turn-settle";

type Item = { feed_type?: string; data?: unknown };

const PROMPT = "Run the digest";
const guard = (messages: ChatMessage[]) =>
  messages.filter((m) => m.role === "user").at(-1)?.content === PROMPT;

function state(): { s: TurnState; items: Item[] } {
  const items: Item[] = [];
  const output: FeedOutput = {
    pushFeedItem: (_a, _s, item) => {
      items.push(item as Item);
    },
    sessionStatus: () => {},
    persistBoardStatus: async () => {},
  };
  const s = newTurnState("Houston/Bo", "routine-digest", output);
  s.delivered = true;
  return { s, items };
}

const SUMMARY = "Summary: the chat so far covered three invoices.";

const earlier: ChatMessage[] = [
  { role: "user", content: "Earlier", ts: 1, turnId: "t-0" },
  { role: "assistant", content: "Earlier reply", ts: 2, turnId: "t-0" },
];
const ours: ChatMessage = {
  role: "user",
  content: PROMPT,
  ts: 3,
  turnId: "t-1",
};
const pendingMarker: ChatMessage = {
  role: "assistant",
  content: SUMMARY,
  ts: 4,
  compaction: { trigger: "native" },
};

const presettle = (s: TurnState, messages: ChatMessage[], adopted: string[]) =>
  presettleFromHistory(
    s,
    async () => messages,
    undefined,
    guard,
    () => false,
    (id) => adopted.push(id),
  );

test("the poll never adopts a summary marker written while the turn still runs", async () => {
  const { s, items } = state();
  const adopted: string[] = [];
  const settled = await presettle(
    s,
    [...earlier, ours, pendingMarker],
    adopted,
  );
  expect(settled).toBe("pending");
  expect(s.settled).toBe(false);
  expect(items).toEqual([]);
  expect(adopted).toEqual([]);
});

test("the poll derives the turn id from our user row and adopts the turn's final record", async () => {
  const { s, items } = state();
  const adopted: string[] = [];
  const settled = await presettle(
    s,
    [
      ...earlier,
      ours,
      { ...pendingMarker, turnId: "t-1", compaction: { trigger: "proactive" } },
      {
        role: "assistant",
        content: "Two invoices are overdue.",
        ts: 5,
        turnId: "t-1",
      },
    ],
    adopted,
  );
  expect(settled).toBe("settled");
  expect(adopted).toEqual(["t-1"]);
  const final = items.find((i) => i.feed_type === "final_result")?.data as {
    result: string;
  };
  expect(final.result).toBe("Two invoices are overdue.");
});

test("the poll does not adopt another turn's reply when our row is not the newest", async () => {
  const { s } = state();
  const settled = await presettle(
    s,
    [
      ...earlier,
      { role: "user", content: "Something else", ts: 3, turnId: "t-2" },
    ],
    [],
  );
  expect(settled).toBe("pending");
});

test("a lost terminal with a pending summary trailing does not settle on it", async () => {
  const { s, items } = state();
  await reloadAndSettle(
    s,
    async () => [...earlier, ours, pendingMarker],
    undefined,
    guard,
    () => {},
  );
  expect(items.some((i) => i.data === SUMMARY)).toBe(false);
  expect(items.some((i) => i.data === TURN_DIED_MESSAGE)).toBe(true);
});

test("a history without turn ids keeps the legacy trailing-reply settle", async () => {
  const { s, items } = state();
  const settled = await presettle(
    s,
    [
      { role: "user", content: "Earlier", ts: 1 },
      { role: "assistant", content: "Earlier reply", ts: 2 },
      { role: "user", content: PROMPT, ts: 3 },
      { role: "assistant", content: "Legacy reply", ts: 4 },
    ],
    [],
  );
  expect(settled).toBe("settled");
  const final = items.find((i) => i.feed_type === "final_result")?.data as {
    result: string;
  };
  expect(final.result).toBe("Legacy reply");
});

test("a mixed history keeps the legacy settle for our own id-less turn", async () => {
  const { s, items } = state();
  const settled = await presettle(
    s,
    [
      ...earlier,
      { role: "user", content: PROMPT, ts: 3 },
      { role: "assistant", content: "Id-less reply", ts: 4 },
    ],
    [],
  );
  expect(settled).toBe("settled");
  const final = items.find((i) => i.feed_type === "final_result")?.data as {
    result: string;
  };
  expect(final.result).toBe("Id-less reply");
});

test("an id-less turn never settles on a pending summary marker either", async () => {
  const { s } = state();
  const settled = await presettle(
    s,
    [...earlier, { role: "user", content: PROMPT, ts: 3 }, pendingMarker],
    [],
  );
  expect(settled).toBe("pending");
});
