import type { ChatMessage } from "@houston/runtime-client";
import { expect, test } from "vitest";
import { finishAccountBlocked } from "./account-blocked-refusal";
import type { FeedOutput, PendingInteraction } from "./feed-output";
import { settleFromHistory, TURN_DIED_MESSAGE } from "./settle-from-history";
import { ENGINE_RESTART_MESSAGE, ENGINE_RESUMED_MESSAGE } from "./turn-errors";
import { SANDBOX_LOST_MESSAGE } from "./turn-notices";
import {
  finishErr,
  finishOk,
  newTurnState,
  settleProviderErrorCard,
  type TurnState,
} from "./turn-settle";

type Item = { feed_type?: string; data?: unknown; fails_pending?: boolean };

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
  s.delivered = true;
  settleFromHistory(s, messages, turnId, () => opts.guard ?? false);
  return { s, items, statuses };
}

const usage = { context_tokens: 42, output_tokens: 7, cached_tokens: 0 };

test("a not-connected refusal fails the optimistic bubble (the send never landed)", () => {
  const { items, output } = recorder();
  const s = newTurnState("Houston/Bo", "activity", output, { prompt: "hi" });
  finishErr(s, "No provider connected. Log in with Claude or Codex first.");
  const card = items.find((i) => i.feed_type === "provider_error");
  expect(card?.fails_pending).toBe(true);
});

test("a blocked-account refusal settles as the billing_locked card, not a sign-in", () => {
  const { items, statuses, output } = recorder();
  const s = newTurnState("Houston/Bo", "activity", output, { prompt: "hi" });
  s.provider = "anthropic";
  finishAccountBlocked(s, {
    code: "provider_account_blocked",
    error: "The github-copilot account is blocked by the provider.",
    provider: "github-copilot",
  });
  const card = items.find((i) => i.feed_type === "provider_error");
  expect(card?.data).toMatchObject({
    kind: "unauthenticated",
    cause: "billing_locked",
    provider: "github-copilot",
    failed_prompt: "hi",
  });
  expect(card?.fails_pending).toBe(true);
  expect(s.settled).toBe(true);
  expect(statuses.at(-1)?.[0]).toBe("error");
  finishErr(s, "late failure");
  expect(items.filter((i) => i.feed_type === "system_message")).toHaveLength(0);
});

test("a genuine turn error fails the optimistic bubble", () => {
  const { items, output } = recorder();
  const s = newTurnState("Houston/Bo", "activity", output);
  finishErr(
    s,
    "Your message didn't reach the agent. Check your connection and send it again.",
  );
  const line = items.find((i) => i.feed_type === "system_message");
  expect(line?.fails_pending).toBe(true);
});

test("a user Stop keeps the optimistic bubble confirmed (the message WAS delivered)", () => {
  const { items, output } = recorder();
  const s = newTurnState("Houston/Bo", "activity", output);
  finishErr(s, "Stopped by user");
  const line = items.find((i) => i.feed_type === "system_message");
  expect(line?.fails_pending).toBeUndefined();
});

test("matches the assistant reply by turnId and adopts its text + usage", () => {
  const { s, items, statuses } = run(
    [
      { role: "user", content: "hi", ts: 1, turnId: "t-1" },
      { role: "assistant", content: "Full reply", ts: 2, turnId: "t-1", usage },
      { role: "user", content: "next", ts: 3, turnId: "t-2" },
    ],
    "t-1",
  );
  expect(s.settled).toBe(true);
  expect(s.terminal).toBe("needs_you");
  expect(items).toContainEqual({
    feed_type: "assistant_text",
    data: "Full reply",
    turnId: "t-1",
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
    steps: [
      {
        kind: "question",
        id: "q1",
        question: "Which date?",
        options: [{ id: "a", label: "Fri" }],
      },
    ],
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
  expect(s.terminal).toBe("needs_you");
  expect(s.pendingInteraction).toEqual(interaction);
  expect(statuses).toEqual([["completed", undefined]]);
});

test("an empty-summary plan_ready settles to needs_you like every blocking interaction", () => {
  const interaction: PendingInteraction = {
    steps: [{ kind: "plan_ready", id: "p1", summary: "" }],
  };
  const { s } = run(
    [
      { role: "user", content: "plan it", ts: 1, turnId: "t-1" },
      {
        role: "assistant",
        content: "Here is the plan.",
        ts: 2,
        turnId: "t-1",
        pendingInteraction: interaction,
      },
    ],
    "t-1",
  );
  expect(s.terminal).toBe("needs_you");
  expect(s.pendingInteraction).toEqual(interaction);
});

test("a legacy pre-step pendingInteraction on a persisted reply is ignored, not adopted", () => {
  const legacy = {
    kind: "question",
    question: "which date?",
    options: [{ id: "a", label: "Fri" }],
  } as unknown as PendingInteraction;
  const { s } = run(
    [
      { role: "user", content: "book it", ts: 1, turnId: "t-1" },
      {
        role: "assistant",
        content: "which date?",
        ts: 2,
        turnId: "t-1",
        pendingInteraction: legacy,
      },
    ],
    "t-1",
  );
  expect(s.settled).toBe(true);
  expect(s.pendingInteraction).toBeNull();
  expect(s.terminal).toBe("needs_you");
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

test("a live provider-error settle finalizes the streamed reply BEFORE the card", () => {
  const { items, output } = recorder();
  const s = newTurnState("Houston/Bo", "activity", output);
  s.delivered = true;
  s.text = "partial reply";
  s.thinking = "some reasoning";
  settleProviderErrorCard(s, {
    kind: "rate_limited",
    provider: "anthropic",
    model: null,
    retry_after_seconds: null,
    message: "slow down",
  });
  expect(items.map((i) => i.feed_type)).toEqual([
    "thinking",
    "assistant_text",
    "provider_error",
    "final_result",
  ]);
  expect(items[1].data).toBe("partial reply");
});

test("a history settle of a failed turn adopts the persisted partial reply below-the-card too", () => {
  const providerError = {
    kind: "rate_limited",
    provider: "anthropic",
    message: "slow down",
  } as ChatMessage["providerError"];
  const { items } = run(
    [
      { role: "user", content: "hi", ts: 1, turnId: "t-1" },
      {
        role: "assistant",
        content: "got halfway",
        ts: 2,
        turnId: "t-1",
        providerError,
      },
    ],
    "t-1",
  );
  const textAt = items.findIndex((i) => i.feed_type === "assistant_text");
  const cardAt = items.findIndex((i) => i.feed_type === "provider_error");
  expect(textAt).toBeGreaterThanOrEqual(0);
  expect(items[textAt].data).toBe("got halfway");
  expect(cardAt).toBeGreaterThan(textAt);
});

test("a persisted stopped reply settles needs_you with the standard stop line, not a plain finish", () => {
  const { s, items, statuses } = run(
    [
      { role: "user", content: "do it", ts: 1, turnId: "t-1" },
      {
        role: "assistant",
        content: "working on",
        ts: 2,
        turnId: "t-1",
        stopped: true,
      },
    ],
    "t-1",
  );
  expect(s.settled).toBe(true);
  expect(s.terminal).toBe("needs_you");
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: "Stopped by user",
    turnId: "t-1",
  });
  expect(items.some((i) => i.feed_type === "provider_error")).toBe(false);
  expect(statuses).toEqual([["error", undefined]]);
});

test("a stopped reply with an (illegal) pendingInteraction: stopped wins, no card is rendered", () => {
  const interaction: PendingInteraction = {
    steps: [{ kind: "question", id: "q1", question: "which date?" }],
  };
  const { s, items } = run(
    [
      { role: "user", content: "do it", ts: 1, turnId: "t-1" },
      {
        role: "assistant",
        content: "",
        ts: 2,
        turnId: "t-1",
        stopped: true,
        pendingInteraction: interaction,
      },
    ],
    "t-1",
  );
  expect(s.terminal).toBe("needs_you");
  expect(s.pendingInteraction).toBeNull();
  expect(items.some((i) => i.feed_type === "provider_error")).toBe(false);
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: "Stopped by user",
    turnId: "t-1",
  });
});

test("an `interrupted` reply for our turnId settles as the ENGINE RESTART error, never a completed render", () => {
  const { s, items, statuses } = run(
    [
      { role: "user", content: "export it", ts: 1, turnId: "t-1" },
      {
        role: "assistant",
        content: "",
        ts: 2,
        turnId: "t-1",
        interrupted: { cause: "engine_restart", tool: "bash" },
      },
    ],
    "t-1",
    { streamed: "half a repl" },
  );
  expect(s.settled).toBe(true);
  expect(s.terminal).toBe("error");
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: ENGINE_RESTART_MESSAGE,
    notice: "engine_restart",
    turnId: "t-1",
  });
  expect(items.some((i) => i.feed_type === "final_result")).toBe(false);
  expect(items.some((i) => i.feed_type === "provider_error")).toBe(false);
  expect(statuses).toEqual([["error", ENGINE_RESTART_MESSAGE]]);
});

test("a lost-sandbox reply settles as its own error line, never the restart promise", () => {
  const { s, items, statuses } = run(
    [
      { role: "user", content: "export it", ts: 1, turnId: "t-1" },
      {
        role: "assistant",
        content: "",
        ts: 2,
        turnId: "t-1",
        interrupted: { cause: "sandbox_lost" },
      },
    ],
    "t-1",
    { streamed: "half a repl" },
  );
  expect(s.settled).toBe(true);
  expect(s.terminal).toBe("error");
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: SANDBOX_LOST_MESSAGE,
    notice: "sandbox_lost",
    turnId: "t-1",
  });
  expect(items.some((i) => i.data === ENGINE_RESTART_MESSAGE)).toBe(false);
  expect(statuses).toEqual([["error", SANDBOX_LOST_MESSAGE]]);
});

test("a RESUMED interruption settles neutrally: the pause line, no error, no terminal card", () => {
  const { s, items, statuses } = run(
    [
      { role: "user", content: "export it", ts: 1, turnId: "t-1" },
      {
        role: "assistant",
        content: "",
        ts: 2,
        turnId: "t-1",
        interrupted: { cause: "engine_restart", tool: "bash", resumed: true },
      },
    ],
    "t-1",
    { streamed: "half a repl" },
  );
  expect(s.settled).toBe(true);
  expect(s.terminal).toBeNull();
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: ENGINE_RESUMED_MESSAGE,
    notice: "engine_resumed",
    turnId: "t-1",
  });
  expect(items.some((i) => i.feed_type === "provider_error")).toBe(false);
  expect(statuses).toEqual([["completed", undefined]]);
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

test("finishOk without a captured interaction settles the card to needs_you", () => {
  const { statuses, output } = recorder();
  const s = newTurnState("Houston/Bo", "activity-clean", output);
  s.text = "all set";
  finishOk(s);
  expect(s.settled).toBe(true);
  expect(s.terminal).toBe("needs_you");
  expect(s.pendingInteraction).toBe(null);
  expect(statuses).toEqual([["completed", undefined]]);
});

test("finishOk with a blocking interaction settles needs_you and keeps the interaction", () => {
  const { statuses, output } = recorder();
  const s = newTurnState("Houston/Bo", "activity-ask", output);
  s.text = "which one?";
  const interaction: PendingInteraction = {
    steps: [
      {
        kind: "question",
        id: "q1",
        question: "Pick a flight?",
        options: [{ id: "a", label: "Morning" }],
      },
    ],
  };
  s.pendingInteraction = interaction;
  finishOk(s);
  expect(s.terminal).toBe("needs_you");
  expect(s.pendingInteraction).toEqual(interaction);
  expect(statuses).toEqual([["completed", undefined]]);
});

test("finishOk with a LONE suggest_reusable step settles needs_you and persists the offer", () => {
  const { statuses, output } = recorder();
  const s = newTurnState("Houston/Bo", "activity-suggest", output);
  s.text = "Done. Sales summary is ready.";
  const interaction: PendingInteraction = {
    steps: [
      {
        kind: "suggest_reusable",
        id: "r1",
        reusableKind: "skill",
        title: "Weekly sales summary",
        rationale: "Saves you rebuilding it every Monday.",
      },
    ],
  };
  s.pendingInteraction = interaction;
  finishOk(s);
  expect(s.terminal).toBe("needs_you");
  expect(s.pendingInteraction).toEqual(interaction);
  expect(statuses).toEqual([["completed", undefined]]);
});

test("finishOk keeps BOTH suggestion offers on the needs_you settle", () => {
  const { output } = recorder();
  const s = newTurnState("Houston/Bo", "activity-actions", output);
  const interaction: PendingInteraction = {
    steps: [
      {
        kind: "suggest_actions",
        id: "a1",
        actions: [
          { id: "draft", label: "Draft", message: "Draft it." },
          { id: "share", label: "Share", message: "Share it." },
        ],
      },
      {
        kind: "suggest_reusable",
        id: "r1",
        reusableKind: "skill",
        title: "Weekly summary",
        rationale: "Useful every week.",
      },
    ],
  };
  s.pendingInteraction = interaction;
  finishOk(s);
  expect(s.terminal).toBe("needs_you");
  expect(s.pendingInteraction).toEqual(interaction);
});

test("finishOk with a lone suggest_actions step settles needs_you and persists the bubbles", () => {
  const { output } = recorder();
  const s = newTurnState("Houston/Bo", "activity-actions-only", output);
  const interaction: PendingInteraction = {
    steps: [
      {
        kind: "suggest_actions",
        id: "a1",
        actions: [
          { id: "draft", label: "Draft", message: "Draft it." },
          { id: "share", label: "Share", message: "Share it." },
        ],
      },
    ],
  };
  s.pendingInteraction = interaction;
  finishOk(s);
  expect(s.terminal).toBe("needs_you");
  expect(s.pendingInteraction).toEqual(interaction);
});

test("finishOk with suggest_actions beside a question settles needs_you with both steps", () => {
  const { output } = recorder();
  const s = newTurnState("Houston/Bo", "activity-actions-question", output);
  const interaction: PendingInteraction = {
    steps: [
      { kind: "question", id: "q1", question: "Which account?" },
      {
        kind: "suggest_actions",
        id: "a1",
        actions: [
          { id: "draft", label: "Draft", message: "Draft it." },
          { id: "share", label: "Share", message: "Share it." },
        ],
      },
    ],
  };
  s.pendingInteraction = interaction;
  finishOk(s);
  expect(s.terminal).toBe("needs_you");
  expect(s.pendingInteraction).toEqual(interaction);
});

test("finishOk with suggest_reusable co-occurring with a question settles needs_you", () => {
  const { output } = recorder();
  const s = newTurnState("Houston/Bo", "activity-suggest-mixed", output);
  s.text = "which one?";
  s.pendingInteraction = {
    steps: [
      { kind: "question", id: "q1", question: "Which week?" },
      {
        kind: "suggest_reusable",
        id: "r1",
        reusableKind: "skill",
        title: "Weekly sales summary",
        rationale: "Saves you rebuilding it every Monday.",
      },
    ],
  };
  finishOk(s);
  expect(s.terminal).toBe("needs_you");
});

test("finishOk with a single branded question step settles needs_you (confirmations are BLOCKING)", () => {
  const { statuses, output } = recorder();
  const s = newTurnState("Houston/Bo", "activity-confirm", output);
  s.text = "Ready to send the email?";
  s.pendingInteraction = {
    steps: [
      {
        kind: "question",
        id: "q1",
        question: "Should I send the draft?",
        toolkit: "gmail",
      },
    ],
  };
  finishOk(s);
  expect(s.terminal).toBe("needs_you");
  expect(statuses).toEqual([["completed", undefined]]);
});

test("finishOk with a plan_ready step settles needs_you and keeps the plan", () => {
  const { output } = recorder();
  const s = newTurnState("Houston/Bo", "activity-plan", output);
  const interaction: PendingInteraction = {
    steps: [{ kind: "plan_ready", id: "p1", summary: "Three steps." }],
  };
  s.pendingInteraction = interaction;
  finishOk(s);
  expect(s.terminal).toBe("needs_you");
  expect(s.pendingInteraction).toEqual(interaction);
});

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
    fails_pending: true,
    data: {
      kind: "unauthenticated",
      provider: "openai",
      cause: "no_credentials",
      message: NOT_CONNECTED,
      failed_prompt: "hey",
    },
  });
  expect(items.some((i) => i.feed_type === "system_message")).toBe(false);
  expect(items.some((i) => i.feed_type === "final_result")).toBe(true);
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
  s.delivered = true;
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
