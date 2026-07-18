import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { FeedItem } from "@houston-ai/chat";
import {
  filterProviderAuthFeedItems,
  isProviderAuthMessage,
  providerAuthSignalKey,
} from "../src/components/tabs/provider-auth-feed.ts";

describe("isProviderAuthMessage", () => {
  it("recognizes the new engine's not-connected refusal (both variants)", () => {
    // The TS engine refuses a turn whose provider is logged out with these
    // verbatim strings and emits NO AuthRequired event, so this feed message
    // is the only signal that surfaces the in-chat reconnect card.
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
    // Verbatim from runtime ai/openai-compatible.ts: a chat pinned to the
    // local provider whose endpoint was disconnected in Settings fails every
    // send with this message and NO AuthRequired event — the feed pattern is
    // the only card trigger.
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
    // A `.includes("401")` fired on any hex UUID that contained the digits,
    // e.g. the activity id the routine-setup kickoff echoes — hiding the whole
    // reply. Word-boundary matching leaves such an embedded code alone.
    strictEqual(
      isProviderAuthMessage(
        'Set its "setup_activity_id" field to exactly ' +
          '"9a7a4276-750e-43dc-a551-d96401409c01".',
      ),
      false,
    );
    // Neither does a plain sentence that merely spells the digits inside a word.
    strictEqual(isProviderAuthMessage("Order #40199 shipped."), false);
    // …but a standalone status code is still an auth signal.
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
