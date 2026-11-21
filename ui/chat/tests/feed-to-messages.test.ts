import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  getChatDisplayItems,
  shouldShowThinkingIndicator,
} from "../src/chat-process-groups.ts";
import { deriveStatus } from "../src/chat-status.ts";
import { feedItemsToMessages } from "../src/feed-to-messages.ts";
import type { FeedItem } from "../src/types.ts";

const user = (text: string): FeedItem => ({
  feed_type: "user_message",
  data: text,
  id: "u1",
});

const streamText = (text: string, id = "t1"): FeedItem => ({
  feed_type: "assistant_text_streaming",
  data: text,
  id,
});

const finalText = (text: string, id = "t1"): FeedItem => ({
  feed_type: "assistant_text",
  data: text,
  id,
});

const toolCall = (name: string, id: string, input: unknown = {}): FeedItem => ({
  feed_type: "tool_call",
  data: { name, input },
  id,
});

const toolResult = (content: string, id: string): FeedItem => ({
  feed_type: "tool_result",
  data: { content, is_error: false },
  id,
});

describe("tool_call after streamed narration (HOU-1047)", () => {
  const feed = [
    user("connect to anakin"),
    streamText("Let me connect to anakin.io for you."),
    toolCall("integration_execute", "c1", { app: "anakin" }),
    toolResult("ok", "r1"),
    toolCall("integration_execute", "c2", { app: "anakin" }),
  ];

  it("splits the narration and the tools into separate messages", () => {
    const messages = feedItemsToMessages(feed);
    strictEqual(messages.length, 3);
    strictEqual(messages[1].from, "assistant");
    strictEqual(messages[1].content, "Let me connect to anakin.io for you.");
    deepStrictEqual(messages[1].tools, []);
    strictEqual(messages[2].from, "assistant");
    strictEqual(messages[2].content, "");
    strictEqual(messages[2].tools.length, 2);
  });

  it("renders a live trailing mission log, not the loading indicator", () => {
    const messages = feedItemsToMessages(feed);
    const status = deriveStatus(feed, true);
    strictEqual(status, "submitted");
    const items = getChatDisplayItems(messages, status);
    const last = items[items.length - 1];
    strictEqual(last.kind, "process");
    strictEqual(last.kind === "process" && last.isActive, true);
    strictEqual(shouldShowThinkingIndicator(items, status), false);
  });

  it("keeps the process block's key stable while more tools stream in", () => {
    const early = getChatDisplayItems(
      feedItemsToMessages(feed.slice(0, 4)),
      "submitted",
    );
    const later = getChatDisplayItems(feedItemsToMessages(feed), "submitted");
    const earlyKey = early.find((i) => i.kind === "process")?.key;
    const laterKey = later.find((i) => i.kind === "process")?.key;
    strictEqual(Boolean(earlyKey), true);
    strictEqual(earlyKey, laterKey);
  });

  it("keeps the same process key when the turn settles (no remount/jump)", () => {
    const live = getChatDisplayItems(feedItemsToMessages(feed), "submitted");
    const settledFeed = [
      user("connect to anakin"),
      finalText("Let me connect to anakin.io for you."),
      ...feed.slice(2),
      {
        feed_type: "final_result",
        data: { result: "", cost_usd: null, duration_ms: null, usage: null },
        id: "fr1",
      } satisfies FeedItem,
    ];
    const settled = getChatDisplayItems(
      feedItemsToMessages(settledFeed),
      "ready",
    );
    const liveProcess = live[live.length - 1];
    const settledProcess = settled[settled.length - 1];
    strictEqual(liveProcess.kind, "process");
    strictEqual(settledProcess.kind, "process");
    strictEqual(
      liveProcess.kind === "process" && liveProcess.key,
      settledProcess.kind === "process" && settledProcess.key,
    );
    strictEqual(
      settledProcess.kind === "process" && settledProcess.isActive,
      false,
    );
  });

  it("splits a second tool phase off a tools-then-text message", () => {
    const multiPhase = [
      user("top 5 hacker news"),
      toolCall("integration_search", "c1", {}),
      toolResult("apps", "r1"),
      streamText("I'll fetch the current Hacker News front page."),
      toolCall("bash", "c2", { cmd: "curl hn" }),
    ];
    const messages = feedItemsToMessages(multiPhase);
    strictEqual(messages.length, 3);
    strictEqual(messages[1].tools.length, 1);
    strictEqual(
      messages[1].content,
      "I'll fetch the current Hacker News front page.",
    );
    strictEqual(messages[2].content, "");
    strictEqual(messages[2].tools.length, 1);
    const items = getChatDisplayItems(messages, "submitted");
    const kinds = items.map((i) => i.kind);
    deepStrictEqual(kinds, ["message", "process", "message", "process"]);
    const first = items[1];
    const last = items[3];
    strictEqual(first.kind === "process" && first.isActive, false);
    strictEqual(last.kind === "process" && last.isActive, true);
    strictEqual(shouldShowThinkingIndicator(items, "submitted"), false);
  });

  it("settles to the text bubble above an inactive mission log", () => {
    const settled = [
      user("connect to anakin"),
      finalText("Let me connect to anakin.io for you. Done!"),
      toolCall("integration_execute", "c1", { app: "anakin" }),
      toolResult("ok", "r1"),
      {
        feed_type: "final_result",
        data: { result: "", cost_usd: null, duration_ms: null, usage: null },
        id: "fr1",
      } satisfies FeedItem,
    ];
    const messages = feedItemsToMessages(settled);
    const items = getChatDisplayItems(messages, "ready");
    const kinds = items.map((i) => i.kind);
    deepStrictEqual(kinds, ["message", "message", "process"]);
    const process = items[2];
    strictEqual(process.kind === "process" && process.isActive, false);
  });
});

describe("tool_call placeholder dedup across the narration flush", () => {
  it("replaces the null-input placeholder inside the fresh tools message", () => {
    const messages = feedItemsToMessages([
      user("go"),
      streamText("Narrating first."),
      toolCall("bash", "c1", null),
      toolCall("bash", "c2", { cmd: "ls" }),
    ]);
    strictEqual(messages.length, 3);
    strictEqual(messages[2].tools.length, 1);
    deepStrictEqual(messages[2].tools[0].input, { cmd: "ls" });
  });

  it("keeps appending to a tools-only message (no spurious splits)", () => {
    const messages = feedItemsToMessages([
      user("go"),
      toolCall("bash", "c1", { cmd: "ls" }),
      toolResult("ok", "r1"),
      toolCall("read", "c2", { path: "a.ts" }),
    ]);
    strictEqual(messages.length, 2);
    strictEqual(messages[1].tools.length, 2);
    strictEqual(messages[1].content, "");
  });

  it("matches a tool_result to the call that moved into the new message", () => {
    const messages = feedItemsToMessages([
      user("go"),
      streamText("Narrating first."),
      toolCall("bash", "c1", { cmd: "ls" }),
      toolResult("listing", "r1"),
    ]);
    strictEqual(messages[2].tools[0].result?.content, "listing");
  });
});

describe("provider-error dedup keys on kind, not provider", () => {
  const authError = (provider: string, id: string): FeedItem => ({
    feed_type: "provider_error",
    data: {
      kind: "unauthenticated",
      provider,
      cause: "unknown",
      message: "Your session has ended.",
    },
    id,
  });

  it("upgrades the unlabeled card in place when a labeled one follows", () => {
    const messages = feedItemsToMessages([
      user("hi"),
      authError("", "e1"),
      authError("openai", "e2"),
    ]);
    const cards = messages.filter((m) => m.providerError);
    strictEqual(cards.length, 1);
    strictEqual(cards[0].providerError?.provider, "openai");
    strictEqual(cards[0].key, "provider-error-e1-unauthenticated");
  });

  it("keeps the first card's retry state when upgrading its label", () => {
    const messages = feedItemsToMessages([
      user("hi"),
      {
        feed_type: "provider_error",
        data: {
          kind: "unauthenticated",
          provider: "",
          cause: "no_credentials",
          message: "Your session has ended.",
          undelivered_prompt: "original ask",
        },
        id: "e1",
      } as FeedItem,
      authError("openai", "e2"),
    ]);
    const cards = messages.filter((m) => m.providerError);
    strictEqual(cards.length, 1);
    const card = cards[0].providerError;
    strictEqual(card?.provider, "openai");
    strictEqual(
      card?.kind === "unauthenticated" ? card.undelivered_prompt : undefined,
      "original ask",
    );
    strictEqual(
      card?.kind === "unauthenticated" ? card.cause : undefined,
      "no_credentials",
    );
  });

  it("keeps the label when the labeled card arrives first", () => {
    const messages = feedItemsToMessages([
      user("hi"),
      authError("openai", "e1"),
      authError("", "e2"),
    ]);
    const cards = messages.filter((m) => m.providerError);
    strictEqual(cards.length, 1);
    strictEqual(cards[0].providerError?.provider, "openai");
    strictEqual(cards[0].key, "provider-error-e1-unauthenticated");
  });

  it("collapses two identically labeled cards", () => {
    const messages = feedItemsToMessages([
      user("hi"),
      authError("openai", "e1"),
      authError("openai", "e2"),
    ]);
    strictEqual(messages.filter((m) => m.providerError).length, 1);
  });

  it("gives each turn its own card", () => {
    const messages = feedItemsToMessages([
      user("first"),
      authError("", "e1"),
      user("second"),
      authError("", "e2"),
    ]);
    strictEqual(messages.filter((m) => m.providerError).length, 2);
  });
});

describe("context boundaries", () => {
  it("turns a cleared context into its own divider message", () => {
    const messages = feedItemsToMessages([
      user("remember my flight"),
      { feed_type: "context_cleared", data: null, id: "c1" },
      user("hello again"),
    ]);
    const divider = messages.find((m) => m.compaction);
    strictEqual(divider?.from, "system");
    strictEqual(divider?.compaction?.kind, "context_cleared");
    strictEqual(messages.filter((m) => m.from === "user").length, 2);
  });

  it("carries a manual compaction's trigger through to the divider", () => {
    const messages = feedItemsToMessages([
      {
        feed_type: "context_compacted",
        data: { trigger: "manual", pre_tokens: 120 },
        id: "k1",
      },
    ]);
    deepStrictEqual(messages[0]?.compaction, {
      kind: "compacted",
      trigger: "manual",
      preTokens: 120,
    });
  });

  it("carries the engine's typed notice onto the system message, and nothing else", () => {
    const messages = feedItemsToMessages([
      {
        feed_type: "system_message",
        data: "Your agent had to restart.",
        notice: "engine_restart",
        id: "s1",
      },
      { feed_type: "system_message", data: "Stopped by user", id: "s2" },
    ]);
    strictEqual(messages[0]?.from, "system");
    strictEqual(messages[0]?.notice, "engine_restart");
    strictEqual("notice" in (messages[1] ?? {}), false);
  });
});

describe("host cards", () => {
  it("become their own system row, carrying the card, between the turns around them", () => {
    const card = { kind: "goal", payload: { goal: "x" }, ownsProgress: true };
    const messages = feedItemsToMessages([
      { feed_type: "assistant_text", data: "Before", id: "a1" },
      { feed_type: "host_card", data: card, id: "c1" },
      { feed_type: "assistant_text", data: "After", id: "a2" },
    ]);
    deepStrictEqual(
      messages.map((m) => [m.from, m.content]),
      [
        ["assistant", "Before"],
        ["system", ""],
        ["assistant", "After"],
      ],
    );
    strictEqual(messages[1].key, "host-card-c1");
    deepStrictEqual(messages[1].hostCard, card);
  });
});

describe("a tool result after a teammate's message lands mid-turn", () => {
  it("still finds the call it answers", () => {
    const messages = feedItemsToMessages([
      { feed_type: "user_message", data: "Research this", id: "u1" },
      {
        feed_type: "tool_call",
        data: { name: "web_search", input: { q: "x" } },
        id: "c1",
      },
      { feed_type: "user_message", data: "Also check y", id: "u2" },
      {
        feed_type: "tool_result",
        data: { name: "web_search", content: "found", is_error: false },
        id: "r1",
      },
    ]);
    const call = messages.flatMap((m) => m.tools)[0];
    deepStrictEqual(call?.result, { content: "found", is_error: false });
  });
});
