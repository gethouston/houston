import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { FeedItem } from "@houston-ai/chat";
import {
  filterProviderAuthFeedItems,
  isProviderAuthMessage,
  providerAuthSignalKey,
} from "../src/components/agent/provider-auth-feed.ts";

describe("isProviderAuthMessage", () => {
  it("recognizes the new engine's not-connected refusal (both variants)", () => {
    strictEqual(
      isProviderAuthMessage(
        "No provider connected. Log in with Claude or Codex first.",
      ),
      true,
    );
    strictEqual(
      isProviderAuthMessage(
        "No provider connected. Connect your subscription first.",
      ),
      true,
    );
  });

  it("still recognizes the existing auth-failure patterns", () => {
    strictEqual(isProviderAuthMessage("Error 401: unauthorized"), true);
    strictEqual(isProviderAuthMessage("Please run /login to continue"), true);
    strictEqual(isProviderAuthMessage("Your session expired"), true);
  });

  it("recognizes the runtime's disconnected-local-model refusal (surfaces the reconnect card)", () => {
    strictEqual(
      isProviderAuthMessage(
        "No local model configured. Set a base URL and model for the OpenAI-compatible provider.",
      ),
      true,
    );
  });

  it("does not flag ordinary assistant text as an auth problem", () => {
    strictEqual(
      isProviderAuthMessage("Sure! Here is how to connect your database."),
      false,
    );
    strictEqual(isProviderAuthMessage("Hallo! Wie kann ich helfen?"), false);
  });

  it("does not match a code buried inside a longer token (HOU-734)", () => {
    strictEqual(
      isProviderAuthMessage(
        'Set its "setup_activity_id" field to exactly ' +
          '"9a7a4276-750e-43dc-a551-d96401409c01".',
      ),
      false,
    );
    strictEqual(isProviderAuthMessage("Order #40199 shipped."), false);
    strictEqual(isProviderAuthMessage("Request failed: 401"), true);
  });
});

describe("filterProviderAuthFeedItems keeps a real reply that echoes a 401-bearing id (HOU-734)", () => {
  it("does not drop the assistant reply or its final_result", () => {
    const reply =
      'Roger that. Set "setup_activity_id" to ' +
      '"9a7a4276-750e-43dc-a551-d96401409c01".';
    const items: FeedItem[] = [
      { feed_type: "user_message", data: "" },
      { feed_type: "assistant_text", data: reply },
      {
        feed_type: "final_result",
        data: { result: reply, cost_usd: null, duration_ms: null, usage: null },
      },
    ];
    const filtered = filterProviderAuthFeedItems(items);
    strictEqual(filtered.length, 3);
  });
});

describe("providerAuthSignalKey", () => {
  it("returns a key for a not-connected system_message (drives the reconnect card)", () => {
    const items: FeedItem[] = [
      { feed_type: "user_message", data: "now?" },
      {
        feed_type: "system_message",
        data: "No provider connected. Log in with Claude or Codex first.",
      },
    ];
    strictEqual(providerAuthSignalKey(items), "1:system_message");
  });

  it("returns null for a clean conversation", () => {
    const items: FeedItem[] = [
      { feed_type: "user_message", data: "Hallo" },
      { feed_type: "assistant_text", data: "Hallo! Wie kann ich helfen?" },
    ];
    strictEqual(providerAuthSignalKey(items), null);
  });
});

describe("filterProviderAuthFeedItems", () => {
  it("hides the raw not-connected message so only the reconnect card shows", () => {
    const items: FeedItem[] = [
      { feed_type: "user_message", data: "now?" },
      {
        feed_type: "system_message",
        data: "No provider connected. Log in with Claude or Codex first.",
      },
    ];
    const filtered = filterProviderAuthFeedItems(items);
    strictEqual(filtered.length, 1);
    strictEqual(filtered[0].feed_type, "user_message");
  });
});

describe("filterProviderAuthFeedItems keeps the words of a model that ran", () => {
  const handoffTurn = (reply: string): FeedItem[] => [
    {
      feed_type: "user_message",
      data: "Open the login page and hand it to me",
    },
    {
      feed_type: "tool_call",
      data: { name: "browser", input: { action: "handoff" } },
    },
    {
      feed_type: "tool_result",
      data: {
        name: "browser",
        content: 'The person finished: "Please log in on the page."',
        is_error: false,
      },
    },
    { feed_type: "assistant_text", data: reply },
    {
      feed_type: "final_result",
      data: { result: reply, cost_usd: null, duration_ms: null, usage: null },
    },
  ];

  it("keeps a hand-off reply that asks the person to log in", () => {
    const items = handoffTurn(
      "Please log in in the browser, then click Done. The secure page says hi.",
    );
    strictEqual(filterProviderAuthFeedItems(items).length, items.length);
    strictEqual(providerAuthSignalKey(items), null);
  });

  it("keeps the reply while it streams, before its turn's tools land", () => {
    const items: FeedItem[] = [
      { feed_type: "user_message", data: "Sign me in" },
      { feed_type: "thinking", data: "Opening the page" },
      { feed_type: "assistant_text_streaming", data: "Please log in here." },
    ];
    strictEqual(filterProviderAuthFeedItems(items).length, 3);
  });

  it("keeps a tool's result that reads like an auth error", () => {
    const items: FeedItem[] = [
      { feed_type: "user_message", data: "Fetch it" },
      { feed_type: "tool_call", data: { name: "fetch", input: {} } },
      {
        feed_type: "tool_result",
        data: { name: "fetch", content: "401 Unauthorized", is_error: true },
      },
    ];
    strictEqual(filterProviderAuthFeedItems(items).length, 3);
  });

  it("still hides an auth failure from a turn where the model never ran", () => {
    const items: FeedItem[] = [
      ...handoffTurn("Please log in in the browser, then click Done."),
      { feed_type: "user_message", data: "And now?" },
      {
        feed_type: "assistant_text",
        data: "Invalid API key · Please run /login",
      },
    ];
    const filtered = filterProviderAuthFeedItems(items);
    strictEqual(filtered.length, items.length - 1);
    strictEqual(filtered.at(-1)?.feed_type, "user_message");
    strictEqual(
      providerAuthSignalKey(items),
      `${items.length - 1}:assistant_text`,
    );
  });
});
