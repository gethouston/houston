import { strictEqual } from "node:assert";
import { describe, it } from "node:test";

import type { FeedItem } from "@houston-ai/chat";
import {
  feedShowsAgentReply,
  shouldOfferSkip,
} from "../src/components/onboarding/missions/email-skip.ts";

describe("feedShowsAgentReply (HOU-555 onboarding escape hatch)", () => {
  it("an empty feed has no agent reply", () => {
    strictEqual(feedShowsAgentReply([]), false);
  });

  it("the user's own kickoff message does not count", () => {
    const feed: FeedItem[] = [
      { feed_type: "user_message", data: "Send an email to myself" },
      { feed_type: "tool_call", data: { name: "COMPOSIO", input: {} } },
    ];
    strictEqual(feedShowsAgentReply(feed), false);
  });

  it("the agent's first text counts, streaming included", () => {
    strictEqual(
      feedShowsAgentReply([{ feed_type: "assistant_text", data: "On it." }]),
      true,
    );
    strictEqual(
      feedShowsAgentReply([
        { feed_type: "assistant_text_streaming", data: "On" },
      ]),
      true,
    );
  });

  it("a surfaced turn error counts as a reply", () => {
    strictEqual(
      feedShowsAgentReply([
        {
          feed_type: "provider_error",
          data: { type: "RateLimited" } as never,
        },
      ]),
      true,
    );
  });
});

describe("shouldOfferSkip (HOU-555 onboarding escape hatch)", () => {
  it("hidden until the agent replies — the user's kickoff alone is not enough", () => {
    strictEqual(
      shouldOfferSkip({
        agentReplied: false,
        hasError: false,
        setupDone: false,
      }),
      false,
    );
  });

  it("appears once the agent's first reply lands", () => {
    strictEqual(
      shouldOfferSkip({
        agentReplied: true,
        hasError: false,
        setupDone: false,
      }),
      true,
    );
  });

  it("appears when the kickoff errored, even with no reply", () => {
    strictEqual(
      shouldOfferSkip({
        agentReplied: false,
        hasError: true,
        setupDone: false,
      }),
      true,
    );
  });

  it("hidden on the happy path (completion marker seen)", () => {
    strictEqual(
      shouldOfferSkip({
        agentReplied: true,
        hasError: false,
        setupDone: true,
      }),
      false,
    );
  });
});
