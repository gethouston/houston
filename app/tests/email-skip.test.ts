import { strictEqual } from "node:assert";
import { describe, it } from "node:test";

import type { FeedItem } from "@houston-ai/chat";
import {
  feedShowsTurnError,
  shouldOfferSkip,
} from "../src/components/onboarding/missions/email-skip.ts";

describe("feedShowsTurnError (HOU-555 onboarding escape hatch)", () => {
  it("an empty feed has no error", () => {
    strictEqual(feedShowsTurnError([]), false);
  });

  it("a normal conversation (user + agent + tools) is NOT an error", () => {
    const feed: FeedItem[] = [
      { feed_type: "user_message", data: "Send an email to myself" },
      { feed_type: "assistant_text", data: "On it." },
      { feed_type: "tool_call", data: { name: "COMPOSIO", input: {} } },
    ];
    strictEqual(feedShowsTurnError(feed), false);
  });

  it("a provider error in the feed counts", () => {
    strictEqual(
      feedShowsTurnError([
        {
          feed_type: "provider_error",
          data: { type: "RateLimited" } as never,
        },
      ]),
      true,
    );
  });

  it("a tool runtime error in the feed counts", () => {
    strictEqual(
      feedShowsTurnError([
        {
          feed_type: "tool_runtime_error",
          data: { message: "boom" } as never,
        },
      ]),
      true,
    );
  });
});

describe("shouldOfferSkip (HOU-555 onboarding escape hatch)", () => {
  it("hidden while the mission runs normally — mid-conversation has no skip", () => {
    strictEqual(shouldOfferSkip({ hasError: false, setupDone: false }), false);
  });

  it("appears when something failed", () => {
    strictEqual(shouldOfferSkip({ hasError: true, setupDone: false }), true);
  });

  it("hidden on the happy path (completion marker seen)", () => {
    strictEqual(shouldOfferSkip({ hasError: false, setupDone: true }), false);
  });

  it("hidden even after an error once the mission completed anyway", () => {
    strictEqual(shouldOfferSkip({ hasError: true, setupDone: true }), false);
  });
});
