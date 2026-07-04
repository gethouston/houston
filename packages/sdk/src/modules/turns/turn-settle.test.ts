import type { ChatMessage } from "@houston/runtime-client";
import { expect, test } from "vitest";
import type { FeedOutput } from "./feed-output";
import {
  newTurnState,
  settleFromHistory,
  TURN_DIED_MESSAGE,
  type TurnState,
} from "./turn-settle";

/**
 * settleFromHistory — the "terminal frame was lost" settle. With a turnId the
 * match is exact; without one it falls back to the legacy trailing-reply +
 * guard heuristic. It must NEVER render an empty "completed" turn.
 */

type Item = { feed_type?: string; data?: unknown };

/** A FeedOutput that records every push for assertions. */
function recorder(): {
  items: Item[];
  statuses: Array<[string, string?]>;
  output: FeedOutput;
} {
  const items: Item[] = [];
  const statuses: Array<[string, string?]> = [];
  const output: FeedOutput = {
    pushFeedItem: (_a, _s, item) => {
      items.push(item as Item);
    },
    sessionStatus: (_a, _s, status, error) => {
      statuses.push([status, error]);
    },
    persistBoardStatus: async () => {},
  };
  return { items, statuses, output };
}

function run(
  messages: ChatMessage[] | null,
  turnId: string | undefined,
  opts: { streamed?: string; guard?: boolean } = {},
): { s: TurnState; items: Item[]; statuses: Array<[string, string?]> } {
  const { items, statuses, output } = recorder();
  const s = newTurnState("Houston/Bo", "activity-settle", output);
  s.text = opts.streamed ?? "";
  settleFromHistory(s, messages, turnId, () => opts.guard ?? false);
  return { s, items, statuses };
}

const usage = { context_tokens: 42, output_tokens: 7, cached_tokens: 0 };

test("matches the assistant reply by turnId and adopts its text + usage", () => {
  const { s, items, statuses } = run(
    [
      { role: "user", content: "hi", ts: 1, turnId: "t-1" },
      { role: "assistant", content: "Full reply", ts: 2, turnId: "t-1", usage },
      // A LATER turn's messages must not be adopted.
      { role: "user", content: "next", ts: 3, turnId: "t-2" },
    ],
    "t-1",
  );
  expect(s.settled).toBe(true);
  expect(s.terminal).toBe("needs_you");
  expect(items).toContainEqual({
    feed_type: "assistant_text",
    data: "Full reply",
  });
  const final = items.find((i) => i.feed_type === "final_result")?.data as {
    result: string;
    usage: typeof usage;
  };
  expect(final.result).toBe("Full reply");
  expect(final.usage).toEqual(usage);
  expect(statuses).toEqual([["completed", undefined]]);
});

test("a persisted providerError for our turn settles as the typed card", () => {
  const providerError = {
    kind: "rate_limited",
    provider: "anthropic",
    message: "slow down",
  } as ChatMessage["providerError"];
  const { s, items } = run(
    [
      { role: "user", content: "hi", ts: 1, turnId: "t-1" },
      { role: "assistant", content: "", ts: 2, turnId: "t-1", providerError },
    ],
    "t-1",
  );
  expect(s.settled).toBe(true);
  expect(items.some((i) => i.feed_type === "provider_error")).toBe(true);
});

test("our user message with NO assistant reply for our turnId settles as the dead-turn ERROR", () => {
  const { s, items, statuses } = run(
    [{ role: "user", content: "hi", ts: 1, turnId: "t-1" }],
    "t-1",
    { streamed: "half a repl" },
  );
  expect(s.settled).toBe(true);
  expect(s.terminal).toBe("error");
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: TURN_DIED_MESSAGE,
  });
  // NEVER the old empty "completed" render.
  expect(items.some((i) => i.feed_type === "final_result")).toBe(false);
  expect(statuses).toEqual([["error", TURN_DIED_MESSAGE]]);
});

test("legacy (no turnIds): the guard admits the trailing reply", () => {
  const { items } = run(
    [
      { role: "user", content: "hi", ts: 1 },
      { role: "assistant", content: "Old-world reply", ts: 2 },
    ],
    undefined,
    { guard: true },
  );
  expect(items).toContainEqual({
    feed_type: "assistant_text",
    data: "Old-world reply",
  });
});

test("legacy: a rejected guard settles the streamed accumulation as completed", () => {
  const { s, items } = run(
    [
      { role: "user", content: "hi", ts: 1 },
      { role: "assistant", content: "someone else's reply", ts: 2 },
    ],
    undefined,
    { guard: false, streamed: "what we streamed" },
  );
  expect(s.terminal).toBe("needs_you");
  expect(items).toContainEqual({
    feed_type: "assistant_text",
    data: "what we streamed",
  });
});

test("legacy: a rejected guard with NOTHING streamed settles as the dead-turn error, not an empty completed", () => {
  const { s, items, statuses } = run(
    [{ role: "user", content: "hi", ts: 1 }],
    undefined,
    { guard: false },
  );
  expect(s.terminal).toBe("error");
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: TURN_DIED_MESSAGE,
  });
  expect(statuses).toEqual([["error", TURN_DIED_MESSAGE]]);
});

test("a failed history reload (null) still settles: streamed text as completed, nothing as error", () => {
  const withText = run(null, "t-1", { streamed: "partial tail" });
  expect(withText.s.terminal).toBe("needs_you");
  expect(withText.items).toContainEqual({
    feed_type: "assistant_text",
    data: "partial tail",
  });

  const withoutText = run(null, "t-1");
  expect(withoutText.s.terminal).toBe("error");
});
