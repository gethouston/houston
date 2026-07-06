import type { ChatMessage } from "@houston/runtime-client";
import { expect, test } from "vitest";
import type { FeedOutput, PendingInteraction } from "./feed-output";
import { settleFromHistory, TURN_DIED_MESSAGE } from "./settle-from-history";
import {
  finishErr,
  finishOk,
  newTurnState,
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
  // New semantics: a clean settle with NO pending interaction lands on `done`
  // (the reloaded reply carries none — the terminal `done` frame was lost).
  expect(s.terminal).toBe("done");
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

test("a persisted pendingInteraction recovers on reload: needs_you + the interaction", () => {
  const interaction: PendingInteraction = {
    kind: "question",
    question: "Which date?",
    options: [{ id: "a", label: "Fri" }],
  };
  const { s, statuses } = run(
    [
      { role: "user", content: "book it", ts: 1, turnId: "t-1" },
      {
        role: "assistant",
        content: "which date?",
        ts: 2,
        turnId: "t-1",
        pendingInteraction: interaction,
      },
    ],
    "t-1",
  );
  expect(s.settled).toBe(true);
  // The live `done` was missed; recovering the persisted interaction lands the
  // card on needs_you (not a false `done`) and carries it for the terminal
  // persist — the element-3 machinery reads s.pendingInteraction from here.
  expect(s.terminal).toBe("needs_you");
  expect(s.pendingInteraction).toEqual(interaction);
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
  expect(s.terminal).toBe("done"); // clean settle, no interaction
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
  expect(withText.s.terminal).toBe("done"); // clean settle, no interaction
  expect(withText.items).toContainEqual({
    feed_type: "assistant_text",
    data: "partial tail",
  });

  const withoutText = run(null, "t-1");
  expect(withoutText.s.terminal).toBe("error");
});

/**
 * finishOk — the clean-settle board split (element 3). A turn that ended with
 * a captured pending interaction lands `needs_you` (and the interaction rides
 * the persist via the sink); one with nothing outstanding lands `done`. The
 * session status is `completed` either way.
 */

test("finishOk without a captured interaction settles the card to done", () => {
  const { statuses, output } = recorder();
  const s = newTurnState("Houston/Bo", "activity-done", output);
  s.text = "all set";
  finishOk(s);
  expect(s.settled).toBe(true);
  expect(s.terminal).toBe("done");
  expect(s.pendingInteraction).toBe(null);
  expect(statuses).toEqual([["completed", undefined]]);
});

test("finishOk with a captured interaction settles needs_you and keeps the interaction", () => {
  const { statuses, output } = recorder();
  const s = newTurnState("Houston/Bo", "activity-ask", output);
  s.text = "which one?";
  const interaction: PendingInteraction = {
    kind: "question",
    question: "Pick a flight?",
    options: [{ id: "a", label: "Morning" }],
  };
  // The `done` frame stashes the interaction before finishOk (turn-frames.ts).
  s.pendingInteraction = interaction;
  finishOk(s);
  expect(s.terminal).toBe("needs_you");
  expect(s.pendingInteraction).toEqual(interaction);
  expect(statuses).toEqual([["completed", undefined]]);
});

/**
 * finishErr — the not-connected refusal (HOU-676). A logged-out send is
 * refused BEFORE the message reaches the engine, so it must settle as the
 * persistent typed reconnect card (which survives the reconnect and offers
 * "Send again" with the original text) — never as the raw system message
 * that only fed the auto-dismissing store-driven card.
 */

const NOT_CONNECTED = "No provider connected. Connect an AI provider first.";

test("a not-connected refusal settles as the typed card carrying provider + failed prompt", () => {
  const { items, statuses, output } = recorder();
  const s = newTurnState("Houston/Bo", "activity-nc", output, {
    provider: "openai",
    prompt: "hey",
  });
  finishErr(s, NOT_CONNECTED);
  expect(s.settled).toBe(true);
  expect(s.terminal).toBe("needs_you");
  expect(items).toContainEqual({
    feed_type: "provider_error",
    data: {
      kind: "unauthenticated",
      provider: "openai",
      cause: "no_credentials",
      message: NOT_CONNECTED,
      failed_prompt: "hey",
    },
  });
  // The card IS the surface: no raw system_message duplicate, and the
  // invisible final_result stops the progress line.
  expect(items.some((i) => i.feed_type === "system_message")).toBe(false);
  expect(items.some((i) => i.feed_type === "final_result")).toBe(true);
  // Status clears the loading flag with NO text — text would re-synthesize
  // the "Session error:" echo that fed the auto-dismissing card.
  expect(statuses).toEqual([["error", undefined]]);
});

test("a not-connected refusal without send context still cards (surface resolves the provider)", () => {
  const { items, output } = recorder();
  const s = newTurnState("Houston/Bo", "activity-nc", output);
  finishErr(s, "No provider connected. Connect your subscription first.");
  const card = items.find((i) => i.feed_type === "provider_error")?.data as {
    provider: string;
    failed_prompt?: string;
  };
  expect(card.provider).toBe("");
  expect("failed_prompt" in card).toBe(false);
});

test("a real turn failure still settles as system_message + red error", () => {
  const { items, statuses, output } = recorder();
  const s = newTurnState("Houston/Bo", "activity-boom", output, {
    provider: "openai",
    prompt: "hey",
  });
  finishErr(s, "upstream exploded");
  expect(s.terminal).toBe("error");
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: "upstream exploded",
  });
  expect(items.some((i) => i.feed_type === "provider_error")).toBe(false);
  expect(statuses).toEqual([["error", "upstream exploded"]]);
});

test("a user stop still settles as the neutral needs_you, never a card", () => {
  const { items, statuses, output } = recorder();
  const s = newTurnState("Houston/Bo", "activity-stop", output);
  finishErr(s, "Stopped by user");
  expect(s.terminal).toBe("needs_you");
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: "Stopped by user",
  });
  expect(items.some((i) => i.feed_type === "provider_error")).toBe(false);
  expect(statuses).toEqual([["error", undefined]]);
});
