import { equal } from "node:assert";
import { describe, it } from "node:test";
import { deriveStatus } from "../src/chat-status.ts";
import type { FeedItem } from "../src/types.ts";

const user = (data = "hi"): FeedItem => ({ feed_type: "user_message", data });
const toolCall = (): FeedItem => ({
  feed_type: "tool_call",
  data: { name: "read", input: {} },
});
const toolResult = (): FeedItem => ({
  feed_type: "tool_result",
  data: { content: "ok", is_error: false },
});

describe("deriveStatus", () => {
  it("is ready when idle with a settled feed", () => {
    equal(
      deriveStatus(
        [user(), { feed_type: "assistant_text", data: "hi" }],
        false,
      ),
      "ready",
    );
  });

  it("is submitted on a brand-new chat while loading", () => {
    equal(deriveStatus([], true), "submitted");
  });

  it("is submitted right after the user sends, before isLoading flips", () => {
    equal(deriveStatus([user()], false), "submitted");
  });

  it("is streaming only while visible reply text streams", () => {
    equal(
      deriveStatus(
        [user(), { feed_type: "assistant_text_streaming", data: "he" }],
        true,
      ),
      "streaming",
    );
  });

  it("is ready when the feed ends on a terminal provider-error card, even mid-load", () => {
    // The agent cannot continue (out of usage / rate-limited / logged out) —
    // the thinking phrases must stop, whatever a stale running flag says.
    const card: FeedItem = {
      feed_type: "provider_error",
      data: {
        kind: "rate_limited",
        provider: "anthropic",
        message: "slow down",
      },
    };
    const invisibleFinal: FeedItem = {
      feed_type: "final_result",
      data: { result: "", cost_usd: null, duration_ms: null, usage: null },
    };
    equal(deriveStatus([user(), card], true), "ready");
    // The settle's trailing invisible final_result doesn't hide the card.
    equal(deriveStatus([user(), card, invisibleFinal], true), "ready");
    // A NEW user message after the card is a fresh turn — loader returns.
    equal(
      deriveStatus([user(), card, invisibleFinal, user()], true),
      "submitted",
    );
    // A card buried under later streamed work does not silence a live turn.
    equal(deriveStatus([user(), card, toolCall()], true), "submitted");
  });

  it("stays submitted mid-tool-cycle (HOU-655: loader must not vanish)", () => {
    equal(deriveStatus([user(), toolCall()], true), "submitted");
    equal(deriveStatus([user(), toolCall(), toolResult()], true), "submitted");
  });

  it("stays submitted while reasoning streams inside the collapsed log", () => {
    // Since HOU-448 the thinking stream is hidden behind the collapsed
    // mission log — nothing visible moves, so it must NOT count as
    // "streaming" or the loading helmet flickers off every thinking stretch.
    equal(
      deriveStatus(
        [user(), { feed_type: "thinking_streaming", data: "hmm" }],
        true,
      ),
      "submitted",
    );
  });

  it("stays submitted after a thinking block lands, awaiting the reply", () => {
    equal(
      deriveStatus([user(), { feed_type: "thinking", data: "hmm" }], true),
      "submitted",
    );
  });
});
