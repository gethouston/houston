import type { ChatMessage } from "@houston/runtime-client";
import { expect, test } from "vitest";
import type { FeedOutput } from "./feed-output";
import { presettleFromHistory, reloadAndSettle } from "./settle-from-history";
import { newTurnState, type TurnState } from "./turn-settle";

/**
 * A turn that compacted before its prompt persists TWO assistant records under
 * its id: the summary marker the compaction wrote (claimed by the turn so the
 * divider sits where the context restarted) and, after it, the turn's own
 * reply or failure card. When the live terminal frame is lost (a reconnect),
 * the settle from history must adopt the turn's CONCLUSIVE record, the last
 * one, never the summary: adopting the summary turned a rate-limited turn into
 * a clean success and showed the summary as the agent's answer.
 */

type Item = { feed_type?: string; data?: unknown };

function state(): {
  s: TurnState;
  items: Item[];
  statuses: Array<[string, string?]>;
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
  const s = newTurnState("Houston/Bo", "routine-digest", output);
  s.delivered = true;
  return { s, items, statuses };
}

const SUMMARY = "Summary: the chat so far covered three invoices.";

function compactedTurn(last: Partial<ChatMessage>): ChatMessage[] {
  return [
    { role: "user", content: "Earlier", ts: 1, turnId: "t-0" },
    { role: "assistant", content: "Earlier reply", ts: 2, turnId: "t-0" },
    { role: "user", content: "Run the digest", ts: 3, turnId: "t-1" },
    {
      role: "assistant",
      content: SUMMARY,
      ts: 4,
      turnId: "t-1",
      compaction: { trigger: "proactive", pre_tokens: 180_000 },
    },
    { role: "assistant", content: "", ts: 5, turnId: "t-1", ...last },
  ];
}

const rateLimited = {
  kind: "rate_limited",
  provider: "anthropic",
  model: "claude-opus-5",
  retry_after_seconds: 30,
  message: "429 rate limited",
} as const;

test("a reconnect settles a compacted turn that failed on its error card, not the summary", async () => {
  const { s, items, statuses } = state();
  await reloadAndSettle(
    s,
    async () => compactedTurn({ providerError: rateLimited }),
    "t-1",
    () => false,
    () => {},
  );
  expect(s.settled).toBe(true);
  expect(items.some((i) => i.feed_type === "provider_error")).toBe(true);
  expect(items.some((i) => i.data === SUMMARY)).toBe(false);
  expect(statuses.some(([status]) => status === "completed")).toBe(false);
});

test("a reconnect settles a compacted turn that answered on its reply, not the summary", async () => {
  const { s, items, statuses } = state();
  await reloadAndSettle(
    s,
    async () => compactedTurn({ content: "Two invoices are overdue." }),
    "t-1",
    () => false,
    () => {},
  );
  const final = items.find((i) => i.feed_type === "final_result")?.data as {
    result: string;
  };
  expect(final.result).toBe("Two invoices are overdue.");
  expect(statuses).toEqual([["completed", undefined]]);
});

test("the pre-settled poll adopts the same conclusive record", async () => {
  const { s, items } = state();
  const settled = await presettleFromHistory(
    s,
    async () => compactedTurn({ providerError: rateLimited }),
    "t-1",
    () => false,
    () => false,
  );
  expect(settled).toBe("settled");
  expect(items.some((i) => i.feed_type === "provider_error")).toBe(true);
  expect(items.some((i) => i.data === SUMMARY)).toBe(false);
});

test("a reconnect after /compact settles on the divider, not the summary", async () => {
  // `/compact` folds into the summary it wrote, so that record concludes it.
  const { s, items } = state();
  await reloadAndSettle(
    s,
    async () => [
      { role: "user", content: "/compact", ts: 1, turnId: "t-2" },
      {
        role: "assistant",
        content: SUMMARY,
        ts: 2,
        turnId: "t-2",
        compaction: { trigger: "manual", pre_tokens: 900 },
        compactionSummary: true,
      },
    ],
    "t-2",
    () => false,
    () => {},
  );
  expect(s.settled).toBe(true);
  expect(JSON.stringify(items)).not.toContain(SUMMARY);
});
